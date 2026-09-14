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
