import { config } from './config.js';

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

export function classifySpeed(speedKmh) {
  if (speedKmh == null || !Number.isFinite(speedKmh)) return null;
  if (speedKmh < config.stillMaxKmh) return 'still';
  if (speedKmh <= config.walkMaxKmh) return 'walk';
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

export function filterAnomalies(points) {
  if (!Array.isArray(points) || points.length < 2) return Array.isArray(points) ? points.slice() : [];
  const kept = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i];
    const previous = kept[kept.length - 1];
    const next = points[i + 1];
    const localSpeed = impliedSpeedKmh(points[i - 1], point);
    if (localSpeed != null && localSpeed > config.maxSpeedKmh) continue;
    if (isRoundTripSpike(previous, point, next, config.anomalyMinKm)) continue;
    kept.push(point);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

export function classifyTrack(points) {
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
      mode: classifySpeed(speed),
    });
    previous = Number.isFinite(time)
      ? { time, lat: point.latitude, lng: point.longitude }
      : null;
  }

  return result;
}
