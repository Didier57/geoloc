import { Unzip, UnzipInflate } from 'fflate';
import { readDay, saveDay } from './history.js';
import { clearEmptyDay } from './store.js';
import { toDayString } from './dates.js';

const MAX_JSON_ENTRY_BYTES = 400 * 1024 * 1024;
const MAX_LISTED_ENTRIES = 200;
const MAX_SKIPPED_ENTRIES = 50;
const MAX_SCAN_NODES = 400000;
const MAX_SCAN_DEPTH = 16;

const COORD_PAIRS = [
  ['latitudeE7', 'longitudeE7'],
  ['latE7', 'lngE7'],
  ['latitude', 'longitude'],
  ['lat', 'lng'],
  ['lat', 'lon'],
  ['latitude', 'lng'],
  ['latitude', 'lon'],
  ['latDeg', 'lngDeg'],
];
const COORD_STRING_KEYS = [
  'latLng',
  'LatLng',
  'latlng',
  'latLngString',
  'point',
  'placeLocation',
  'geo',
  'geoLocation',
  'coordinates',
  'location',
];
const TIME_KEYS = [
  'timestamp',
  'timestampMs',
  'time',
  'startTime',
  'endTime',
  'startTimestampMs',
  'endTimestampMs',
  'startTimestamp',
  'endTimestamp',
  'date',
  'lastUpdated',
];
const ACCURACY_KEYS = ['accuracy', 'accuracyMeters', 'accuracyM', 'horizontalAccuracy'];

function isZip(buffer) {
  return (
    buffer.length > 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  );
}

function numberOrNull(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
  const entries = [];
  const pushSkipped = (name, reason) => {
    if (skipped.length < MAX_SKIPPED_ENTRIES) skipped.push({ name, reason });
  };
  const pushEntry = (name, size) => {
    if (entries.length < MAX_LISTED_ENTRIES) entries.push({ name, size: size || 0 });
  };

  let failure = null;
  const unzipper = new Unzip((file) => {
    const name = file.name || '';
    pushEntry(name, file.originalSize || 0);
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
  try {
    unzipper.push(bytes, true);
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }
  return { docs, skipped, entries, failure };
}

function toIso(value) {
  if (value === null || value === undefined || value === '') return null;
  let time;
  if (typeof value === 'number') {
    time = Math.abs(value) < 1e11 ? value * 1000 : value;
  } else {
    const text = String(value).trim();
    if (!text) return null;
    if (/^-?\d+(\.\d+)?$/.test(text)) {
      const numeric = Number(text);
      time = Math.abs(numeric) < 1e11 ? numeric * 1000 : numeric;
    } else {
      time = Date.parse(text);
    }
  }
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return date.toISOString();
}

function validCoords(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { latitude: lat, longitude: lng };
}

function parseLatLng(value) {
  if (typeof value !== 'string') return null;
  const parts = value.replace(/^geo:/i, '').split(',');
  if (parts.length < 2) return null;
  const lat = Number.parseFloat(parts[0]);
  const lng = Number.parseFloat(parts[1]);
  return validCoords(lat, lng);
}

function pushPoint(points, latitude, longitude, timestamp, accuracy) {
  const coords = validCoords(Number(latitude), Number(longitude));
  if (!coords) return;
  const iso = toIso(timestamp);
  if (!iso) return;
  const point = { latitude: coords.latitude, longitude: coords.longitude, timestamp: iso, source: 'takeout' };
  const acc = Number(accuracy);
  if (Number.isFinite(acc) && acc > 0) point.accuracy = Math.round(acc);
  points.push(point);
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
          segment.duration?.startTimestampMs ?? segment.duration?.startTimestamp,
          start.accuracyMeters,
        );
      }
      const end = segment.endLocation;
      if (end) {
        pushPoint(
          points,
          Number(end.latitudeE7) / 1e7,
          Number(end.longitudeE7) / 1e7,
          segment.duration?.endTimestampMs ?? segment.duration?.endTimestamp,
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
        visit.duration?.startTimestampMs ?? visit.duration?.startTimestamp ?? location.timestampMs,
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
      if (coords) pushPoint(points, coords.latitude, coords.longitude, item?.time ?? segment.startTime, null);
    }

    const location = segment.visit?.topCandidate?.placeLocation;
    const coords = coordsFromValue(location);
    if (coords) pushPoint(points, coords.latitude, coords.longitude, segment.startTime, null);
  }
}

function extractRawSignals(signals, points) {
  for (const signal of signals) {
    const position = signal?.position;
    if (!position || typeof position !== 'object') continue;
    const coords = coordsFromValue(position.LatLng ?? position.latLng);
    if (coords) {
      pushPoint(points, coords.latitude, coords.longitude, position.timestamp, position.accuracyMeters);
    } else if (position.latitudeE7 !== undefined) {
      fromE7Record(points, position);
    }
  }
}

function coordsFromValue(value) {
  if (typeof value === 'string') return parseLatLng(value);
  if (value && typeof value === 'object') return coordsFromNode(value);
  return null;
}

function coordsFromNode(node) {
  for (const [latKey, lngKey] of COORD_PAIRS) {
    const lat = numberOrNull(node[latKey]);
    const lng = numberOrNull(node[lngKey]);
    if (lat === null || lng === null) continue;
    const scale = /e7/i.test(latKey) || Math.abs(lat) > 90 || Math.abs(lng) > 180 ? 1e7 : 1;
    const coords = validCoords(lat / scale, lng / scale);
    if (coords) return coords;
  }
  for (const key of COORD_STRING_KEYS) {
    const coords = coordsFromValue(node[key]);
    if (coords) return coords;
  }
  return null;
}

function timeFromNode(node) {
  for (const key of TIME_KEYS) {
    const value = node[key];
    if (value === null || value === undefined || typeof value === 'object') continue;
    const iso = toIso(value);
    if (iso) return iso;
  }
  return null;
}

function accuracyFromNode(node) {
  for (const key of ACCURACY_KEYS) {
    const value = numberOrNull(node[key]);
    if (value !== null && value > 0) return Math.round(value);
  }
  return null;
}

function scanNode(node, state, depth, inheritedTime) {
  if (state.nodes > MAX_SCAN_NODES || depth > MAX_SCAN_DEPTH) return;
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) scanNode(item, state, depth + 1, inheritedTime);
    return;
  }
  state.nodes += 1;
  const time = timeFromNode(node) || inheritedTime;
  const coords = coordsFromNode(node);
  if (coords && time) emitPoint(state, coords.latitude, coords.longitude, time, accuracyFromNode(node));
  for (const key in node) {
    const value = node[key];
    if (value && typeof value === 'object') scanNode(value, state, depth + 1, time);
  }
}

function emitPoint(state, latitude, longitude, iso, accuracy) {
  const key = `${iso}|${latitude.toFixed(6)}|${longitude.toFixed(6)}`;
  if (state.seen.has(key)) return;
  state.seen.add(key);
  const point = { latitude, longitude, timestamp: iso, source: 'takeout' };
  if (accuracy && accuracy > 0) point.accuracy = accuracy;
  state.points.push(point);
}

function pointKey(point) {
  return `${point.timestamp}|${point.latitude.toFixed(6)}|${point.longitude.toFixed(6)}`;
}

export function pointsFromDocument(document) {
  const state = { points: [], seen: new Set(), nodes: 0 };

  if (Array.isArray(document)) extractLocations(document, state.points);
  else if (document && typeof document === 'object') {
    if (Array.isArray(document.locations)) extractLocations(document.locations, state.points);
    if (Array.isArray(document.timelineObjects)) extractTimelineObjects(document.timelineObjects, state.points);
    if (Array.isArray(document.semanticSegments)) extractSemanticSegments(document.semanticSegments, state.points);
    if (Array.isArray(document.rawSignals)) extractRawSignals(document.rawSignals, state.points);
  }

  const specific = [];
  for (const point of state.points) {
    const key = pointKey(point);
    if (state.seen.has(key)) continue;
    state.seen.add(key);
    specific.push(point);
  }
  state.points = specific;

  scanNode(document, state, 0, null);

  state.points.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  return state.points;
}

export function readDocuments(buffer) {
  if (isZip(buffer)) return readZipDocuments(buffer);
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  return {
    docs: [{ name: 'fichier-json', text }],
    skipped: [],
    entries: [{ name: 'fichier-json', size: buffer.length }],
    failure: null,
  };
}

export function importTakeout({ entityId, buffer, from, to }) {
  const { docs, skipped, entries, failure } = readDocuments(buffer);

  const stats = {
    entityId,
    isZip: isZip(buffer),
    archiveError: failure,
    entries,
    documents: 0,
    files: [],
    skipped: [...skipped],
    points: 0,
    pointsBeforeRange: 0,
    days: 0,
    added: 0,
    duplicates: 0,
    detectedFrom: null,
    detectedTo: null,
    range: { from: from || null, to: to || null },
  };

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
    if (stats.files.length < MAX_LISTED_ENTRIES) stats.files.push({ name: doc.name, points: points.length });
    for (const point of points) {
      const day = toDayString(new Date(point.timestamp));
      if (!day) continue;
      stats.pointsBeforeRange += 1;
      if (!stats.detectedFrom || day < stats.detectedFrom) stats.detectedFrom = day;
      if (!stats.detectedTo || day > stats.detectedTo) stats.detectedTo = day;
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
