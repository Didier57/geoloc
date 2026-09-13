import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth.js';
import { getHaConfig, setHaConfig } from '../store.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { testConnection } from '../homeassistant.js';

const router = Router();
router.use(requireAuth, requireAdmin);

function serialize() {
  const ha = getHaConfig();
  if (!ha) {
    return { configured: false, url: '', tokenSet: false, lastTestAt: null };
  }
  return {
    configured: Boolean(ha.url && ha.tokenEnc),
    url: ha.url || '',
    tokenSet: Boolean(ha.tokenEnc),
    lastTestAt: ha.lastTestAt || null,
    lastMessage: ha.lastMessage || null,
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
    });
    res.json({ ok: true, message, config: serialize() });
  } catch (err) {
    res.status(400).json({ ok: false, error: 'connection_failed', message: err.message });
  }
});

export default router;
