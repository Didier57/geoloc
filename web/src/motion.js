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
