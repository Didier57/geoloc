import {
  collapseStays,
  detectStays,
  haversineKm,
  STAY_MIN_MINUTES,
  STAY_RADIUS_KM,
} from './motion.js';

const MODES = ['walk', 'drive', 'still'];

const STAY_OUTLIER_TOLERANCE = 3;

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
  const rawPoints = (track?.points || []).filter(
    (point) =>
      point &&
      Number.isFinite(Number(point.latitude)) &&
      Number.isFinite(Number(point.longitude)),
  );
  // On ramene au centre les positions prises pendant un arret : sans cela, le
  // GPS qui derive a l'arret compte comme un trajet (ex. 600 m "en voiture").
  const points = collapseStays(
    rawPoints,
    detectStays(rawPoints, STAY_RADIUS_KM, STAY_MIN_MINUTES, STAY_OUTLIER_TOLERANCE),
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
    const mode = legKm < 0.001 ? 'still' : byMode[to.mode] ? to.mode : 'unknown';

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

  const windowSpeeds = [];
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
    if (Number.isFinite(speed) && speed > 0) windowSpeeds.push(speed);
  }

  // On lisse la série par une médiane glissante sur 5 valeurs : un pic isolé
  // (point GPS aberrant) est neutralisé, alors qu'une vitesse réellement
  // élevée et soutenue est conservée.
  const smoothed = windowSpeeds.map((_, index) => {
    const window = windowSpeeds
      .slice(Math.max(0, index - 2), index + 3)
      .sort((a, b) => a - b);
    return window[Math.floor((window.length - 1) / 2)];
  });
  const windowMax = smoothed.reduce((best, speed) => Math.max(best, speed), 0);

  // Vitesse moyenne en mouvement : on ne divise que la distance reellement
  // parcourue en deplacement par le temps passe en deplacement. Utiliser la
  // distance totale (qui inclut le bruit GPS a l'arret) donnait une moyenne
  // aberrante, parfois superieure a la vitesse max.
  const movingDistanceKm = byMode.walk.distanceKm + byMode.drive.distanceKm;
  const averageSpeedKmh = movingMs > 0 ? movingDistanceKm / (movingMs / 3600000) : 0;

  const durationMs = startMs != null && endMs != null ? endMs - startMs : 0;
  return {
    distanceKm,
    durationMs,
    movingMs,
    stillMs,
    movingDistanceKm,
    averageSpeedKmh,
    maxSpeedKmh: Math.max(windowMax, averageSpeedKmh),
    byMode,
    pointCount: points.length,
  };
}
