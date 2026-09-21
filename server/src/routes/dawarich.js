import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth.js';
import { getDawarichConfig, getHaConfig, setDawarichConfig } from '../store.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { sendPoints, testConnection, toFeature } from '../dawarich.js';
import { listDays } from '../dates.js';
import { collectTracks } from '../tracks.js';

const router = Router();
router.use(requireAuth, requireAdmin);

function currentHaConfig() {
  const ha = getHaConfig();
  if (!ha?.url || !ha?.tokenEnc) return null;
  try {
    return { url: ha.url, token: decryptSecret(ha.tokenEnc) };
  } catch {
    return null;
  }
}

function serialize() {
  const cfg = getDawarichConfig();
  if (!cfg) {
    return { configured: false, url: '', apiKeySet: false, deviceId: '', lastTestAt: null, lastMessage: null };
  }
  return {
    configured: Boolean(cfg.url && cfg.apiKeyEnc),
    url: cfg.url || '',
    apiKeySet: Boolean(cfg.apiKeyEnc),
    deviceId: cfg.deviceId || '',
    lastTestAt: cfg.lastTestAt || null,
    lastMessage: cfg.lastMessage || null,
  };
}

function resolveCredentials(current, url, apiKey) {
  const effectiveUrl = String(url || current?.url || '').trim();
  let effectiveKey = apiKey;
  if (!effectiveKey && current?.apiKeyEnc) {
    try {
      effectiveKey = decryptSecret(current.apiKeyEnc);
    } catch {
      effectiveKey = '';
    }
  }
  return { effectiveUrl, effectiveKey };
}

router.get('/', (req, res) => res.json(serialize()));

router.post('/test', async (req, res) => {
  const current = getDawarichConfig();
  const { effectiveUrl, effectiveKey } = resolveCredentials(current, req.body?.url, req.body?.apiKey);
  try {
    const message = await testConnection({ url: effectiveUrl, apiKey: effectiveKey });
    res.json({ ok: true, message });
  } catch (err) {
    res.status(400).json({ ok: false, error: 'connection_failed', message: err.message });
  }
});

router.post('/', async (req, res) => {
  const current = getDawarichConfig();
  const { effectiveUrl, effectiveKey } = resolveCredentials(current, req.body?.url, req.body?.apiKey);
  if (!effectiveUrl) {
    return res.status(400).json({ error: 'missing_url', message: "L'adresse de Dawarich est requise." });
  }
  if (!effectiveKey) {
    return res.status(400).json({ error: 'missing_api_key', message: 'La clé API est requise.' });
  }

  const deviceId = String(req.body?.deviceId ?? current?.deviceId ?? '').trim();
  try {
    const message = await testConnection({ url: effectiveUrl, apiKey: effectiveKey });
    setDawarichConfig({
      url: effectiveUrl.replace(/\/+$/, ''),
      apiKeyEnc: encryptSecret(effectiveKey),
      deviceId,
      lastTestAt: new Date().toISOString(),
      lastMessage: message,
    });
    res.json({ ok: true, message, config: serialize() });
  } catch (err) {
    res.status(400).json({ ok: false, error: 'connection_failed', message: err.message });
  }
});

router.post('/export', async (req, res) => {
  const cfg = getDawarichConfig();
  if (!cfg?.url || !cfg?.apiKeyEnc) {
    return res
      .status(409)
      .json({ error: 'dawarich_not_configured', message: "Configurez d'abord Dawarich." });
  }

  let apiKey;
  try {
    apiKey = decryptSecret(cfg.apiKeyEnc);
  } catch {
    return res.status(409).json({ error: 'dawarich_not_configured', message: 'Clé API illisible.' });
  }

  const entityIds = (Array.isArray(req.body?.entities) ? req.body.entities : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (entityIds.length === 0) {
    return res.status(400).json({ error: 'missing_entities', message: 'Sélectionnez au moins un appareil.' });
  }

  const from = String(req.body?.from || '').trim();
  const to = String(req.body?.to || '').trim() || from;
  if (!from) {
    return res.status(400).json({ error: 'missing_from', message: 'La date de début est requise.' });
  }

  const days = listDays(from, to);
  const deviceOverride = String(req.body?.deviceId ?? cfg.deviceId ?? '').trim();
  const { tracks, haError } = await collectTracks(currentHaConfig(), entityIds, days);

  const features = [];
  const perEntity = {};
  let skipped = 0;

  for (const track of tracks) {
    let count = 0;
    for (const point of track.points) {
      if (
        !point?.timestamp ||
        !Number.isFinite(Number(point.latitude)) ||
        !Number.isFinite(Number(point.longitude))
      ) {
        skipped += 1;
        continue;
      }
      features.push(toFeature(point, deviceOverride || track.entityId));
      count += 1;
    }
    perEntity[track.entityId] = count;
  }

  if (features.length === 0) {
    return res.json({
      ok: true,
      points: 0,
      sent: 0,
      batches: 0,
      skipped,
      days: days.length,
      entities: entityIds.length,
      perEntity,
      haError,
    });
  }

  try {
    const { sent, batches } = await sendPoints({ url: cfg.url, apiKey }, features);
    res.json({
      ok: true,
      points: features.length,
      sent,
      batches,
      skipped,
      days: days.length,
      entities: entityIds.length,
      perEntity,
      haError,
    });
  } catch (err) {
    res.status(502).json({
      error: 'dawarich_failed',
      message: err.message,
      points: features.length,
      skipped,
    });
  }
});

export default router;
