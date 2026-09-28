import { haversineKm } from './motion.js';

const MODES = ['walk', 'drive', 'still'];

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
  let maxSpeed = 0;
  let sumSpeed = 0;
  let speedSamples = 0;
  let startMs = null;
  let endMs = null;

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const fromMs = new Date(from.timestamp).getTime();
    const toMs = new Date(to.timestamp).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) continue;

    const dt = toMs - fromMs;
    const legKm = haversineKm(from.latitude, from.longitude, to.latitude, to.longitude);
    const mode = byMode[to.mode] ? to.mode : 'unknown';

    distanceKm += legKm;
    byMode[mode].distanceKm += legKm;
    byMode[mode].durationMs += dt;
    if (mode === 'still') stillMs += dt;
    else movingMs += dt;

    const speed =
      to.speed != null && Number.isFinite(to.speed) ? to.speed : legKm / (dt / 3600000);
    if (Number.isFinite(speed)) {
      maxSpeed = Math.max(maxSpeed, speed);
      sumSpeed += speed;
      speedSamples += 1;
    }

    if (startMs == null) startMs = fromMs;
    endMs = toMs;
  }

  const durationMs = startMs != null && endMs != null ? endMs - startMs : 0;
  return {
    distanceKm,
    durationMs,
    movingMs,
    stillMs,
    averageSpeedKmh: speedSamples ? sumSpeed / speedSamples : 0,
    maxSpeedKmh: maxSpeed,
    byMode,
    pointCount: points.length,
  };
}
