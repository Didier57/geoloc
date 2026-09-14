import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getHaConfig, markEmptyDay, hasEmptyDay, clearEmptyDay } from '../store.js';
import { decryptSecret } from '../utils/crypto.js';
import { fetchHistory, fetchStates, mapTrackableEntities } from '../homeassistant.js';
import { reverseGeocode } from '../geocode.js';
import { nearbyPlaces } from '../places.js';
import { hasDay, readDay, saveDay } from '../history.js';
import { dayStart, dayEnd, listDays, todayString } from '../dates.js';
import { runArchive } from '../archive.js';
import { classifyTrack } from '../motion.js';

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
  const today = todayString();
  const dbPoints = new Map(entityIds.map((id) => [id, []]));
  const haPoints = new Map(entityIds.map((id) => [id, []]));
  const needsHa = new Map();
  let haError = null;
  let fromDb = false;
  let fromHa = false;

  for (const day of days) {
    const isPast = day < today;
    const missing = [];
    for (const id of entityIds) {
      if (isPast && hasDay(id, day)) {
        const stored = readDay(id, day);
        if (stored.length > 0) {
          dbPoints.get(id).push(...stored);
          fromDb = true;
        }
      } else if (isPast && hasEmptyDay(id, day)) {
        // Jour déjà vérifié et archivé sans données : inutile de réinterroger Home Assistant.
      } else if (day <= today) {
        missing.push(id);
      }
    }
    if (missing.length > 0) needsHa.set(day, missing);
  }

  for (const [day, missing] of needsHa) {
    let tracks;
    try {
      tracks = await fetchHistory(req.ha, missing, dayStart(day).toISOString(), dayEnd(day).toISOString());
    } catch (err) {
      haError = err.message;
      continue;
    }
    const byEntity = new Map(tracks.map((track) => [track.entityId, track.points]));
    for (const id of missing) {
      const points = byEntity.get(id) || [];
      if (day < today) {
        if (points.length > 0) {
          saveDay(id, day, points);
          clearEmptyDay(id, day);
        } else {
          markEmptyDay(id, day);
        }
      }
      haPoints.get(id).push(...points);
      if (points.length > 0) fromHa = true;
    }
  }

  const tracks = entityIds.map((id) => {
    const merged = new Map();
    for (const point of [...dbPoints.get(id), ...haPoints.get(id)]) {
      if (point?.timestamp) merged.set(point.timestamp, point);
    }
    const sorted = [...merged.values()].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
    );
    return {
      entityId: id,
      points: classifyTrack(sorted),
    };
  });

  const total = tracks.reduce((sum, track) => sum + track.points.length, 0);
  let source = 'none';
  if (total > 0) source = fromDb && fromHa ? 'mixed' : fromHa ? 'ha' : 'db';

  res.json({ tracks, source, haError });
});

router.post('/archive', requireConfig, async (req, res) => {
  const result = await runArchive({ force: req.body?.force === true });
  res.json({ ok: true, ...result });
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

router.get('/places', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'invalid_coords', message: 'Coordonnées invalides.' });
  }
  const radius = Math.min(500, Math.max(50, Number(req.query.radius) || 150));
  try {
    const places = await nearbyPlaces(lat, lng, radius);
    res.json({ places });
  } catch (err) {
    res.status(502).json({ error: 'places_failed', message: err.message });
  }
});

export default router;
