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

export const EARTH_RADIUS_KM = 6371;

export function toRad(degrees) {
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

export function classifySpeed(speedKmh, thresholds = {}) {
  if (speedKmh == null || !Number.isFinite(speedKmh)) return null;
  const stillMaxKmh = thresholds.stillMaxKmh ?? 2;
  const walkMaxKmh = thresholds.walkMaxKmh ?? 8;
  if (speedKmh < stillMaxKmh) return 'still';
  if (speedKmh <= walkMaxKmh) return 'walk';
  return 'drive';
}

export function impliedSpeedKmh(a, b) {
  const from = a?.timestamp ? new Date(a.timestamp).getTime() : NaN;
  const to = b?.timestamp ? new Date(b.timestamp).getTime() : NaN;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  const distanceKm = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
  return distanceKm / ((to - from) / 3600000);
}

function isRoundTripSpike(previous, current, next, minKm) {
  const dPrev = haversineKm(
    previous.latitude,
    previous.longitude,
    current.latitude,
    current.longitude,
  );
  const dNext = haversineKm(
    current.latitude,
    current.longitude,
    next.latitude,
    next.longitude,
  );
  if (dPrev < minKm || dNext < minKm) return false;
  const dGap = haversineKm(previous.latitude, previous.longitude, next.latitude, next.longitude);
  return dGap < Math.min(dPrev, dNext) * 0.5;
}

export function filterAnomalies(points, options = {}) {
  if (!Array.isArray(points) || points.length < 2) return Array.isArray(points) ? points.slice() : [];
  const maxSpeedKmh = Number(options.maxSpeedKmh) > 0 ? Number(options.maxSpeedKmh) : 200;
  const anomalyMinKm = Number(options.anomalyMinKm) > 0 ? Number(options.anomalyMinKm) : 1;
  // Seuil (bien plus bas) pour detecter les excursions aller-retour GPS : une
  // station immobile peut "sauter" de quelques centaines de metres et revenir.
  const jitterMinKm = Number(options.jitterMinKm) > 0 ? Number(options.jitterMinKm) : 0.15;
  const kept = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i];
    const previous = kept[kept.length - 1];
    const next = points[i + 1];
    const raw = points[i - 1];
    const distanceKm = haversineKm(raw.latitude, raw.longitude, point.latitude, point.longitude);
    const localSpeed = impliedSpeedKmh(raw, point);
    if (distanceKm >= anomalyMinKm && localSpeed != null && localSpeed > maxSpeedKmh) {
      continue;
    }
    if (isRoundTripSpike(previous, point, next, jitterMinKm)) continue;
    kept.push(point);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

export function classifyTrack(points, thresholds = {}) {
  if (!Array.isArray(points)) return [];
  const result = [];
  let previous = null;

  for (const point of points) {
    const time = point?.timestamp ? new Date(point.timestamp).getTime() : NaN;
    let speed = null;
    if (previous && Number.isFinite(time) && time > previous.time) {
      const distanceKm = haversineKm(previous.lat, previous.lng, point.latitude, point.longitude);
      const hours = (time - previous.time) / 3600000;
      speed = distanceKm / hours;
    }
    result.push({
      ...point,
      speed: speed == null ? null : Math.round(speed * 10) / 10,
      mode: classifySpeed(speed, thresholds),
    });
    previous = Number.isFinite(time)
      ? { time, lat: point.latitude, lng: point.longitude }
      : null;
  }

  return result;
}

export const STAY_RADIUS_KM = 0.2;
export const STAY_MIN_MINUTES = 5;

export function detectStays(
  points,
  radiusKm = STAY_RADIUS_KM,
  minMinutes = STAY_MIN_MINUTES,
  outlierTolerance = 0,
) {
  const stays = [];
  let cluster = null;
  let outliers = 0;

  const flush = () => {
    if (!cluster) return;
    const first = cluster.points[0];
    const last = cluster.points[cluster.points.length - 1];
    const startMs = new Date(first.timestamp).getTime();
    const endMs = new Date(last.timestamp).getTime();
    const durationMs = endMs - startMs;
    if (
      cluster.points.length >= 2 &&
      Number.isFinite(durationMs) &&
      durationMs >= minMinutes * 60000
    ) {
      stays.push({
        latitude: cluster.centerLat,
        longitude: cluster.centerLng,
        start: first.timestamp,
        end: last.timestamp,
        durationMs,
        count: cluster.points.length,
      });
    }
    cluster = null;
  };

  const beginCluster = (point) => {
    cluster = {
      centerLat: point.latitude,
      centerLng: point.longitude,
      points: [point],
    };
    outliers = 0;
  };

  points.forEach((point) => {
    if (point.latitude == null || point.longitude == null) return;
    if (!cluster) {
      beginCluster(point);
      return;
    }
    const distance = haversineKm(
      cluster.centerLat,
      cluster.centerLng,
      point.latitude,
      point.longitude,
    );
    if (distance <= radiusKm) {
      cluster.points.push(point);
      const n = cluster.points.length;
      cluster.centerLat += (point.latitude - cluster.centerLat) / n;
      cluster.centerLng += (point.longitude - cluster.centerLng) / n;
      outliers = 0;
      return;
    }
    outliers += 1;
    if (outliers > outlierTolerance) {
      flush();
      beginCluster(point);
    }
  });
  flush();
  return stays;
}

// Ramene au centre de l'arret toutes les positions tombant pendant celui-ci.
// Le GPS qui "se promene" pendant une immobilisation ne doit pas etre vu comme
// un deplacement (ni sur la carte, ni dans les statistiques).
export function collapseStays(points, stays) {
  if (!Array.isArray(points)) return [];
  if (!Array.isArray(stays) || stays.length === 0) return points.slice();
  return points.map((point) => {
    const time = new Date(point.timestamp).getTime();
    if (!Number.isFinite(time)) return point;
    const stay = stays.find((item) => {
      const start = new Date(item.start).getTime();
      const end = new Date(item.end).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && time >= start && time <= end;
    });
    if (!stay) return point;
    return { ...point, latitude: stay.latitude, longitude: stay.longitude };
  });
}
