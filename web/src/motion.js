export const MODE_COLORS = {
  walk: '#16a34a',
  drive: '#dc2626',
  still: '#94a3b8',
};

export const MODE_LABELS = {
  walk: 'À pied',
  drive: 'En voiture',
  still: 'Immobile',
};

export const MODE_ORDER = ['walk', 'drive', 'still'];

const EARTH_RADIUS_KM = 6371;

function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

export function haversineKm(aLat, aLng, bLat, bLng) {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDegrees(aLat, aLng, bLat, bLng) {
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const dLng = toRad(bLng - aLng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function modeColor(mode, fallback) {
  return MODE_COLORS[mode] || fallback;
}

export const STAY_RADIUS_KM = 0.2;
export const STAY_MIN_MINUTES = 5;

export function detectStays(points, radiusKm = STAY_RADIUS_KM, minMinutes = STAY_MIN_MINUTES) {
  const stays = [];
  let cluster = null;

  const flush = () => {
    if (!cluster) return;
    const start = new Date(cluster.points[0].timestamp).getTime();
    const last = cluster.points[cluster.points.length - 1];
    const end = new Date(last.timestamp).getTime();
    const durationMs = end - start;
    if (
      cluster.points.length >= 2 &&
      Number.isFinite(durationMs) &&
      durationMs >= minMinutes * 60000
    ) {
      stays.push({
        latitude: cluster.centerLat,
        longitude: cluster.centerLng,
        start: cluster.points[0].timestamp,
        end: last.timestamp,
        durationMs,
        count: cluster.points.length,
      });
    }
    cluster = null;
  };

  points.forEach((point) => {
    if (point.latitude == null || point.longitude == null) return;
    if (!cluster) {
      cluster = {
        anchorLat: point.latitude,
        anchorLng: point.longitude,
        centerLat: point.latitude,
        centerLng: point.longitude,
        points: [point],
      };
      return;
    }
    const distance = haversineKm(cluster.anchorLat, cluster.anchorLng, point.latitude, point.longitude);
    if (distance <= radiusKm) {
      cluster.points.push(point);
      const n = cluster.points.length;
      cluster.centerLat += (point.latitude - cluster.centerLat) / n;
      cluster.centerLng += (point.longitude - cluster.centerLng) / n;
    } else {
      flush();
      cluster = {
        anchorLat: point.latitude,
        anchorLng: point.longitude,
        centerLat: point.latitude,
        centerLng: point.longitude,
        points: [point],
      };
    }
  });
  flush();
  return stays;
}
