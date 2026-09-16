import { Unzip, UnzipInflate } from 'fflate';
import { readDay, saveDay } from './history.js';
import { clearEmptyDay } from './store.js';
import { toDayString } from './dates.js';

const MAX_JSON_ENTRY_BYTES = 400 * 1024 * 1024;
const MAX_SKIPPED_ENTRIES = 50;

function isZip(buffer) {
  return (
    buffer.length > 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  );
}

function concatChunks(chunks, total) {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function readZipDocuments(buffer) {
  const docs = [];
  const skipped = [];
  const pushSkipped = (name, reason) => {
    if (skipped.length < MAX_SKIPPED_ENTRIES) skipped.push({ name, reason });
  };

  const unzipper = new Unzip((file) => {
    const name = file.name || '';
    if (!/\.json$/i.test(name)) return;
    if (file.originalSize && file.originalSize > MAX_JSON_ENTRY_BYTES) {
      pushSkipped(name, 'too_large');
      return;
    }
    const chunks = [];
    let size = 0;
    file.ondata = (err, chunk, final) => {
      if (err) {
        pushSkipped(name, 'inflate_error');
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
      if (!final) return;
      if (size > MAX_JSON_ENTRY_BYTES) {
        pushSkipped(name, 'too_large');
        return;
      }
      docs.push({ name, text: new TextDecoder('utf-8').decode(concatChunks(chunks, size)) });
    };
    file.start();
  });

  unzipper.register(UnzipInflate);
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  unzipper.push(bytes, true);
  return { docs, skipped };
}

function toIso(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber.toISOString();
  }
  const text = String(value).trim();
  if (!text) return null;
  let date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) return null;
    date = new Date(numeric);
  }
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function pushPoint(points, latitude, longitude, timestamp, accuracy) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
  if (lat === 0 && lng === 0) return;
  const iso = toIso(timestamp);
  if (!iso) return;
  const point = { latitude: lat, longitude: lng, timestamp: iso, source: 'takeout' };
  const acc = Number(accuracy);
  if (Number.isFinite(acc) && acc > 0) point.accuracy = Math.round(acc);
  points.push(point);
}

function parseLatLng(value) {
  if (typeof value !== 'string') return null;
  const parts = value.replace(/^geo:/i, '').split(',');
  if (parts.length < 2) return null;
  const lat = Number.parseFloat(parts[0]);
  const lng = Number.parseFloat(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

function fromE7Record(points, record) {
  if (!record || typeof record !== 'object') return;
  pushPoint(
    points,
    Number(record.latitudeE7) / 1e7,
    Number(record.longitudeE7) / 1e7,
    record.timestamp ?? record.timestampMs,
    record.accuracy,
  );
}

function extractLocations(locations, points) {
  for (const entry of locations) {
    if (!entry || typeof entry !== 'object') continue;
    if (Array.isArray(entry.locations)) extractLocations(entry.locations, points);
    else fromE7Record(points, entry);
  }
}

function extractTimelineObjects(objects, points) {
  for (const object of objects) {
    if (!object || typeof object !== 'object') continue;

    const segment = object.activitySegment;
    if (segment) {
      const path = segment.simplifiedRawPath || segment.waypointPath;
      const waypoints = path?.points || path?.waypoints || [];
      for (const waypoint of waypoints) {
        pushPoint(
          points,
          Number(waypoint.latE7) / 1e7,
          Number(waypoint.lngE7) / 1e7,
          waypoint.timestampMs ?? waypoint.timestamp,
          waypoint.accuracyMeters,
        );
      }
      const start = segment.startLocation;
      if (start) {
        pushPoint(
          points,
          Number(start.latitudeE7) / 1e7,
          Number(start.longitudeE7) / 1e7,
          segment.duration?.startTimestampMs,
          start.accuracyMeters,
        );
      }
      const end = segment.endLocation;
      if (end) {
        pushPoint(
          points,
          Number(end.latitudeE7) / 1e7,
          Number(end.longitudeE7) / 1e7,
          segment.duration?.endTimestampMs,
          end.accuracyMeters,
        );
      }
    }

    const visit = object.placeVisit;
    if (visit?.location) {
      const location = visit.location;
      pushPoint(
        points,
        Number(location.latitudeE7) / 1e7,
        Number(location.longitudeE7) / 1e7,
        visit.duration?.startTimestampMs ?? location.timestampMs,
        location.accuracyMeters,
      );
    }
  }
}

function extractSemanticSegments(segments, points) {
  for (const segment of segments) {
    if (!segment || typeof segment !== 'object') continue;

    const timelinePath = Array.isArray(segment.timelinePath) ? segment.timelinePath : [];
    for (const item of timelinePath) {
      const coords = parseLatLng(item?.point);
      if (coords) pushPoint(points, coords.latitude, coords.longitude, item.time ?? segment.startTime, null);
    }

    const location = segment.visit?.topCandidate?.placeLocation;
    if (location) {
      const coords = parseLatLng(location);
      if (coords) pushPoint(points, coords.latitude, coords.longitude, segment.startTime, null);
    }
  }
}

function extractRawSignals(signals, points) {
  for (const signal of signals) {
    const position = signal?.position;
    if (!position || typeof position !== 'object') continue;
    const coords = parseLatLng(position.LatLng ?? position.latLng);
    if (coords) {
      pushPoint(points, coords.latitude, coords.longitude, position.timestamp, position.accuracyMeters);
    } else if (position.latitudeE7 !== undefined) {
      fromE7Record(points, position);
    }
  }
}

export function pointsFromDocument(document) {
  const points = [];
  if (Array.isArray(document)) {
    extractLocations(document, points);
    return points;
  }
  if (!document || typeof document !== 'object') return points;
  if (Array.isArray(document.locations)) extractLocations(document.locations, points);
  if (Array.isArray(document.timelineObjects)) extractTimelineObjects(document.timelineObjects, points);
  if (Array.isArray(document.semanticSegments)) extractSemanticSegments(document.semanticSegments, points);
  if (Array.isArray(document.rawSignals)) extractRawSignals(document.rawSignals, points);
  return points;
}

export function readDocuments(buffer) {
  if (isZip(buffer)) return readZipDocuments(buffer);
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  return { docs: [{ name: 'fichier-json', text }], skipped: [] };
}

export function importTakeout({ entityId, buffer, from, to }) {
  const stats = {
    entityId,
    documents: 0,
    files: [],
    points: 0,
    days: 0,
    added: 0,
    duplicates: 0,
    skipped: [],
  };

  const { docs, skipped } = readDocuments(buffer);
  stats.skipped.push(...skipped);

  const byDay = new Map();
  for (const doc of docs) {
    let parsed;
    try {
      parsed = JSON.parse(doc.text.replace(/^\uFEFF/, ''));
    } catch {
      if (stats.skipped.length < MAX_SKIPPED_ENTRIES) stats.skipped.push({ name: doc.name, reason: 'invalid_json' });
      continue;
    }
    const points = pointsFromDocument(parsed);
    if (points.length === 0) {
      if (stats.skipped.length < MAX_SKIPPED_ENTRIES) stats.skipped.push({ name: doc.name, reason: 'no_points' });
      continue;
    }
    stats.documents += 1;
    if (stats.files.length < MAX_SKIPPED_ENTRIES) stats.files.push({ name: doc.name, points: points.length });
    for (const point of points) {
      const day = toDayString(new Date(point.timestamp));
      if (!day) continue;
      if (from && day < from) continue;
      if (to && day > to) continue;
      stats.points += 1;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(point);
    }
  }

  for (const [day, points] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const before = readDay(entityId, day).length;
    const total = saveDay(entityId, day, points);
    const inserted = Math.max(0, total - before);
    stats.added += inserted;
    stats.duplicates += Math.max(0, points.length - inserted);
    stats.days += 1;
    clearEmptyDay(entityId, day);
  }

  return stats;
}
