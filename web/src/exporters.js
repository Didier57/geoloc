import { haversineKm } from './motion.js';

const GAP_MINUTES = 15;
const GAP_KM = 5;

function minutesBetween(a, b) {
  const from = a?.timestamp ? new Date(a.timestamp).getTime() : NaN;
  const to = b?.timestamp ? new Date(b.timestamp).getTime() : NaN;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return (to - from) / 60000;
}

function validPoint(point) {
  return point && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude));
}

export function splitSegments(points) {
  const segments = [];
  let current = [];
  for (const point of points || []) {
    if (!validPoint(point)) continue;
    if (current.length) {
      const previous = current[current.length - 1];
      const minutes = minutesBetween(previous, point);
      const distance = haversineKm(
        previous.latitude,
        previous.longitude,
        point.latitude,
        point.longitude,
      );
      if (minutes > GAP_MINUTES || distance > GAP_KM) {
        segments.push(current);
        current = [];
      }
    }
    current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function trackName(track) {
  return track.name || track.entityId || 'Trace';
}

export function toGeoJSON(tracks) {
  const features = [];
  for (const track of tracks || []) {
    for (const segment of splitSegments(track.points)) {
      if (segment.length < 2) continue;
      features.push({
        type: 'Feature',
        properties: { entityId: track.entityId, name: trackName(track) },
        geometry: {
          type: 'LineString',
          coordinates: segment.map((point) => [Number(point.longitude), Number(point.latitude)]),
        },
      });
    }
  }
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
}

export function toGPX(tracks) {
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="geoloc" xmlns="http://www.topografix.com/GPX/1/1">',
  ];
  for (const track of tracks || []) {
    for (const segment of splitSegments(track.points)) {
      if (segment.length < 2) continue;
      parts.push('  <trk>');
      parts.push(`    <name>${escapeXml(trackName(track))}</name>`);
      parts.push('    <trkseg>');
      for (const point of segment) {
        const time = point.timestamp ? new Date(point.timestamp).toISOString() : null;
        parts.push(
          `      <trkpt lat="${point.latitude}" lon="${point.longitude}">${
            time ? `<time>${time}</time>` : ''
          }</trkpt>`,
        );
      }
      parts.push('    </trkseg>');
      parts.push('  </trk>');
    }
  }
  parts.push('</gpx>');
  return parts.join('\n');
}

export function toKML(tracks) {
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
  ];
  for (const track of tracks || []) {
    for (const segment of splitSegments(track.points)) {
      if (segment.length < 2) continue;
      const coordinates = segment
        .map((point) => `${point.longitude},${point.latitude},0`)
        .join(' ');
      parts.push(
        `  <Placemark><name>${escapeXml(trackName(track))}</name><LineString><tessellate>1</tessellate><coordinates>${coordinates}</coordinates></LineString></Placemark>`,
      );
    }
  }
  parts.push('</Document></kml>');
  return parts.join('\n');
}

export function downloadText(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
