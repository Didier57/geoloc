import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth.js';
import { getHaConfig, listPlaceLabels, markPointDeleted, removePlaceLabel, upsertPlaceLabel } from '../store.js';
import { decryptSecret } from '../utils/crypto.js';
import { fetchStates, mapTrackableEntities } from '../homeassistant.js';
import { reverseGeocode } from '../geocode.js';
import { nearbyPlaces } from '../places.js';
import { deletePoint } from '../history.js';
import { listDays, toDayString } from '../dates.js';
import { runArchive } from '../archive.js';
import { collectTracks } from '../tracks.js';

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
  const { tracks, source, haError } = await collectTracks(req.ha, entityIds, days);

  res.json({ tracks, source, haError });
});

router.post('/archive', requireConfig, async (req, res) => {
  const result = await runArchive({ force: req.body?.force === true });
  res.json({ ok: true, ...result });
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
  res.json({ ok: true, entityId, timestamp, day, removed });
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
