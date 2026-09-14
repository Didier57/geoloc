import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth.js';
import { getHaConfig, setHaConfig, setHaEntities } from '../store.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { fetchStates, mapTrackableEntities, testConnection } from '../homeassistant.js';

const router = Router();

router.get('/status', requireAuth, (req, res) => {
  const ha = getHaConfig();
  res.json({ configured: Boolean(ha?.url && ha?.tokenEnc) });
});

router.use(requireAuth, requireAdmin);

function serialize() {
  const ha = getHaConfig();
  if (!ha) {
    return { configured: false, url: '', tokenSet: false, lastTestAt: null, entities: [] };
  }
  return {
    configured: Boolean(ha.url && ha.tokenEnc),
    url: ha.url || '',
    tokenSet: Boolean(ha.tokenEnc),
    lastTestAt: ha.lastTestAt || null,
    lastMessage: ha.lastMessage || null,
    entities: Array.isArray(ha.entities) ? ha.entities : [],
  };
}

function resolveCredentials(current, url, token) {
  const effectiveUrl = String(url || current?.url || '').trim();
  let effectiveToken = token;
  if (!effectiveToken && current?.tokenEnc) {
    try {
      effectiveToken = decryptSecret(current.tokenEnc);
    } catch {
      effectiveToken = '';
    }
  }
  return { effectiveUrl, effectiveToken };
}

router.get('/', (req, res) => res.json(serialize()));

router.post('/test', async (req, res) => {
  const current = getHaConfig();
  const { effectiveUrl, effectiveToken } = resolveCredentials(current, req.body?.url, req.body?.token);
  try {
    const message = await testConnection({ url: effectiveUrl, token: effectiveToken });
    res.json({ ok: true, message });
  } catch (err) {
    res.status(400).json({ ok: false, error: 'connection_failed', message: err.message });
  }
});

router.post('/', async (req, res) => {
  const current = getHaConfig();
  const { effectiveUrl, effectiveToken } = resolveCredentials(current, req.body?.url, req.body?.token);
  if (!effectiveUrl) return res.status(400).json({ error: 'missing_url', message: "L'adresse de Home Assistant est requise." });
  if (!effectiveToken) return res.status(400).json({ error: 'missing_token', message: 'Le token est requis.' });

  try {
    const message = await testConnection({ url: effectiveUrl, token: effectiveToken });
    setHaConfig({
      url: effectiveUrl.replace(/\/+$/, ''),
      tokenEnc: encryptSecret(effectiveToken),
      lastTestAt: new Date().toISOString(),
      lastMessage: message,
      entities: Array.isArray(current?.entities) ? current.entities : [],
    });
    res.json({ ok: true, message, config: serialize() });
  } catch (err) {
    res.status(400).json({ ok: false, error: 'connection_failed', message: err.message });
  }
});

router.post('/entities', async (req, res) => {
  const current = getHaConfig();
  if (!current?.url || !current?.tokenEnc) {
    return res.status(409).json({ error: 'ha_not_configured', message: "Configurez d'abord Home Assistant." });
  }
  const requested = Array.isArray(req.body?.entities) ? req.body.entities.map(String) : null;
  if (!requested) {
    return res.status(400).json({ error: 'invalid_entities', message: 'Liste d\'entités invalide.' });
  }

  let known = null;
  try {
    const token = decryptSecret(current.tokenEnc);
    const states = await fetchStates({ url: current.url, token });
    known = new Set(mapTrackableEntities(states).map((e) => e.entityId));
  } catch {
    known = null;
  }

  const entities = known ? requested.filter((id) => known.has(id)) : requested;
  const saved = setHaEntities(entities);
  res.json({ ok: true, entities: saved || [] });
});

export default router;
