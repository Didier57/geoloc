import { haversineKm } from './motion.js';

const MODES = ['walk', 'drive', 'still'];

// Fenêtre minimale pour mesurer une vitesse : en dessous, le bruit GPS
// (déplacement de quelques dizaines de mètres en une seconde) fausse tout.
const MIN_SPEED_WINDOW_MS = 15000;

export function formatDistanceKm(km) {
  if (!Number.isFinite(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toLocaleString('fr-FR', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

export function formatDurationMs(ms) {
  const minutes = Math.max(0, Math.round((ms || 0) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours} h ${String(rest).padStart(2, '0')}`;
  if (hours) return `${hours} h`;
  return `${rest} min`;
}

export function computeTrackStats(track) {
  const points = (track?.points || []).filter(
    (point) =>
      point &&
      Number.isFinite(Number(point.latitude)) &&
      Number.isFinite(Number(point.longitude)),
  );

  const byMode = {};
  for (const mode of MODES) byMode[mode] = { distanceKm: 0, durationMs: 0 };
  byMode.unknown = { distanceKm: 0, durationMs: 0 };

  let distanceKm = 0;
  let movingMs = 0;
  let stillMs = 0;
  let startMs = null;
  let endMs = null;

  const times = points.map((point) => new Date(point.timestamp).getTime());
  const legs = new Array(points.length).fill(0);

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const fromMs = times[i - 1];
    const toMs = times[i];
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) continue;

    const dt = toMs - fromMs;
    const legKm = haversineKm(from.latitude, from.longitude, to.latitude, to.longitude);
    legs[i] = legKm;
    const mode = byMode[to.mode] ? to.mode : 'unknown';

    distanceKm += legKm;
    byMode[mode].distanceKm += legKm;
    byMode[mode].durationMs += dt;
    if (mode === 'still') stillMs += dt;
    else movingMs += dt;

    if (startMs == null) startMs = fromMs;
    endMs = toMs;
  }

  // Vitesse max calculée sur une fenêtre glissante d'au moins 15 s : une paire
  // de points trop rapprochée est ignorée pour ne pas réagir au bruit GPS.
  const cumulative = new Array(points.length).fill(0);
  for (let i = 1; i < points.length; i += 1) cumulative[i] = cumulative[i - 1] + legs[i];

  let maxSpeed = 0;
  let start = 0;
  for (let end = 1; end < points.length; end += 1) {
    if (!Number.isFinite(times[end])) continue;
    while (
      start + 1 < end &&
      Number.isFinite(times[start + 1]) &&
      times[end] - times[start + 1] >= MIN_SPEED_WINDOW_MS
    ) {
      start += 1;
    }
    if (!Number.isFinite(times[start])) continue;
    const span = times[end] - times[start];
    if (span < MIN_SPEED_WINDOW_MS) continue;
    const speed = (cumulative[end] - cumulative[start]) / (span / 3600000);
    if (Number.isFinite(speed)) maxSpeed = Math.max(maxSpeed, speed);
  }

  const durationMs = startMs != null && endMs != null ? endMs - startMs : 0;
  return {
    distanceKm,
    durationMs,
    movingMs,
    stillMs,
    averageSpeedKmh: movingMs > 0 ? distanceKm / (movingMs / 3600000) : 0,
    maxSpeedKmh: maxSpeed,
    byMode,
    pointCount: points.length,
  };
}
