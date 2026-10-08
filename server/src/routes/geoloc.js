import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth.js';
import {
  getFilters,
  getHaConfig,
  hasEmptyDay,
  deletedPointsFor,
  listPlaceLabels,
  markPointDeleted,
  readSetting,
  removePlaceLabel,
  setFilters,
  upsertPlaceLabel,
} from '../store.js';
import { decryptSecret } from '../utils/crypto.js';
import { fetchStates, mapTrackableEntities } from '../homeassistant.js';
import { reverseGeocode } from '../geocode.js';
import { deletePoint, listArchives, pointsInBox, readDay } from '../history.js';
import { detectStays, haversineKm, STAY_MIN_MINUTES, STAY_RADIUS_KM } from '../motion.js';
import { dayEnd, dayStart, listDays, todayString, toDayString } from '../dates.js';
import { config } from '../config.js';
import { runArchive, archiveInBackground, isArchiving } from '../archive.js';
import { getJob } from '../jobs.js';
import { collectTracks } from '../tracks.js';
import { logActivity, listActivity } from '../activity.js';

const router = Router();
router.use(requireAuth);

function currentConfig() {
  const ha = getHaConfig();
  if (!ha?.url || !ha?.tokenEnc) return null;
  try {
    return { url: ha.url, token: decryptSecret(ha.tokenEnc) };
  } catch {
    return null;
  }
}

function requireConfig(req, res, next) {
  const cfg = currentConfig();
  if (!cfg) {
    return res.status(409).json({ error: 'ha_not_configured', message: "Home Assistant n'est pas encore configuré." });
  }
  req.ha = cfg;
  return next();
}

router.get('/entities', requireConfig, async (req, res) => {
  const states = await fetchStates(req.ha);
  const all = mapTrackableEntities(states);
  if (req.query.all === '1') {
    const ha = getHaConfig();
    return res.json({ entities: all, selected: Array.isArray(ha?.entities) ? ha.entities : [] });
  }
  const selected = new Set(getHaConfig()?.entities || []);
  res.json({ entities: all.filter((e) => selected.has(e.entityId)) });
});

router.get('/tracks', requireConfig, async (req, res) => {
  const entityIds = String(req.query.entities || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (entityIds.length === 0) return res.json({ tracks: [], source: 'none' });

  const from = req.query.from;
  if (!from) return res.status(400).json({ error: 'missing_from', message: 'La date de début est requise.' });
  const to = req.query.to || from;

  const days = listDays(from, to);
  const { tracks, source, haError, removed } = await collectTracks(req.ha, entityIds, days);

  res.json({ tracks, source, haError, removed });
});

const FILTER_DEFAULTS = {
  maxSpeedKmh: config.maxSpeedKmh,
  anomalyMinKm: config.anomalyMinKm,
};

router.get('/filters', (req, res) => {
  res.json({ filters: getFilters() || FILTER_DEFAULTS, defaults: FILTER_DEFAULTS });
});

router.post('/filters', requireAdmin, (req, res) => {
  res.json({ filters: setFilters(req.body || {}), defaults: FILTER_DEFAULTS });
});

router.post('/archive', requireConfig, async (req, res) => {
  const force = req.body?.force === true;
  const all = req.body?.all === true;
  if (all) {
    const result = await runArchive({ force, all });
    return res.json({ ok: true, ...result });
  }
  const started = archiveInBackground({ force, all });
  return res.json({ ok: true, background: true, ...started });
});

router.get('/archive/status', (req, res) => {
  res.json({ running: isArchiving(), job: getJob() });
});

router.get('/jobs', (req, res) => {
  res.json({ job: getJob() });
});

const STALE_AFTER_DAYS = 2;

router.get('/status', (req, res) => {
  const ha = getHaConfig();
  const configured = Boolean(ha?.url && ha?.tokenEnc);
  const sync = readSetting('sync_status') || null;
  const lastOkAt = readSetting('sync_last_ok_at') || (sync?.ok ? sync.at : null);
  let staleDays = null;
  if (lastOkAt) {
    const time = new Date(lastOkAt).getTime();
    if (Number.isFinite(time)) staleDays = Math.floor((Date.now() - time) / 86400000);
  }
  res.json({
    configured,
    sync,
    lastOkAt,
    staleDays,
    stale: !lastOkAt || staleDays == null || staleDays >= STALE_AFTER_DAYS,
    db: readSetting('db_health') || null,
    backup: readSetting('db_backup_last') || null,
  });
});

router.get('/activity', requireAdmin, (req, res) => {
  res.json({ activity: listActivity(req.query.limit) });
});

router.delete('/point', requireAdmin, (req, res) => {
  const entityId = String(req.query.entityId || '').trim();
  const timestamp = String(req.query.timestamp || '').trim();
  if (!entityId || !timestamp) {
    return res
      .status(400)
      .json({ error: 'missing_params', message: "L'entité et l'horodatage sont requis." });
  }
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) {
    return res.status(400).json({ error: 'invalid_timestamp', message: 'Horodatage invalide.' });
  }
  const day = toDayString(new Date(time));
  const removed = deletePoint(entityId, day, timestamp);
  markPointDeleted(entityId, timestamp);
  logActivity('point', `Point supprimé (${entityId} à ${timestamp})`);
  res.json({ ok: true, entityId, timestamp, day, removed });
});

router.get('/diag', requireAdmin, (req, res) => {
  const wanted = String(req.query.entityId || '').trim();
  const archives = listArchives().filter((item) => !wanted || item.entityId === wanted);
  const report = archives.map(({ entityId, days }) => ({
    entityId,
    days: days.slice(-120).map((day) => {
      const raw = readDay(entityId, day);
      const startMs = dayStart(day).getTime();
      const endMs = dayEnd(day).getTime();
      let inWindow = 0;
      let badTime = 0;
      for (const point of raw) {
        const time = point?.timestamp ? new Date(point.timestamp).getTime() : NaN;
        if (!Number.isFinite(time)) badTime += 1;
        else if (time >= startMs && time <= endMs) inWindow += 1;
      }
      return { day, raw: raw.length, inWindow, badTime, empty: hasEmptyDay(entityId, day) };
    }),
  }));
  res.json({
    today: todayString(),
    timeZone: config.timeZone,
    deletedPoints: wanted ? deletedPointsFor(wanted).length : null,
    archives: report,
  });
});

router.get('/labels', (req, res) => {
  res.json({ labels: listPlaceLabels() });
});

router.post('/labels', (req, res) => {
  const { latitude, longitude, name, placeId } = req.body || {};
  const labels = upsertPlaceLabel({ latitude, longitude, name, placeId });
  if (!labels) {
    return res
      .status(400)
      .json({ error: 'invalid_label', message: 'Coordonnées ou nom invalides.' });
  }
  logActivity('place', `Lieu nommé : ${String(name || '').trim()}`);
  res.json({ labels });
});

router.delete('/labels', (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: 'invalid_coords', message: 'Coordonnées invalides.' });
  }
  res.json({ labels: removePlaceLabel(latitude, longitude) });
});

const VISIT_RADIUS_M = 200;
const STAY_OUTLIER_TOLERANCE = 3;

router.get('/label-visits', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'invalid_coords', message: 'Coordonnées invalides.' });
  }
  const radiusM = Math.min(1000, Math.max(50, Number(req.query.radius) || VISIT_RADIUS_M));
  const radiusKm = radiusM / 1000;

  let entities = String(req.query.entities || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (entities.length === 0) entities = listArchives().map((item) => item.entityId);

  const deltaLat = radiusKm / 111.32;
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const deltaLng = radiusKm / (111.32 * cosLat);

  const byEntity = new Map(entities.map((entityId) => [entityId, new Map()]));
  for (const entityId of entities) {
    byEntity.set(
      entityId,
      pointsInBox(entityId, lat - deltaLat, lat + deltaLat, lng - deltaLng, lng + deltaLng),
    );
  }

  const haConfig = currentConfig();
  if (haConfig) {
    try {
      const today = todayString();
      const { tracks } = await collectTracks(haConfig, entities, [today]);
      for (const track of tracks) {
        const points = track.points.filter(
          (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
        );
        if (points.length === 0) continue;
        const days = byEntity.get(track.entityId) || new Map();
        const existing = days.get(today) || [];
        const seen = new Set(existing.map((point) => point.timestamp));
        const merged = [...existing];
        for (const point of points) {
          if (seen.has(point.timestamp)) continue;
          merged.push(point);
          seen.add(point.timestamp);
        }
        days.set(today, merged);
        byEntity.set(track.entityId, days);
      }
    } catch {
      /* Home Assistant indisponible : on se contente des archives */
    }
  }

  const visits = [];
  for (const [entityId, days] of byEntity) {
    for (const [day, points] of days) {
      if (!points || points.length === 0) continue;
      const sorted = [...points].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const stays = detectStays(sorted, STAY_RADIUS_KM, STAY_MIN_MINUTES, STAY_OUTLIER_TOLERANCE);
      for (const stay of stays) {
        const distanceKm = haversineKm(lat, lng, stay.latitude, stay.longitude);
        if (distanceKm > radiusKm) continue;
        visits.push({
          entityId,
          day,
          start: stay.start,
          end: stay.end,
          durationMs: stay.durationMs,
          distanceM: Math.round(distanceKm * 1000),
          latitude: stay.latitude,
          longitude: stay.longitude,
        });
      }
    }
  }
  visits.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  res.json({ visits, radius: radiusM, entities });
});

router.get('/reverse', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'invalid_coords', message: 'Coordonnées invalides.' });
  }
  try {
    const address = await reverseGeocode(lat, lng);
    res.json({ address });
  } catch (err) {
    res.status(502).json({ error: 'geocode_failed', message: err.message });
  }
});

export default router;
