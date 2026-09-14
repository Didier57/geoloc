import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth.js';
import { getHaConfig, setHaConfig } from '../store.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { listArchives, readDay, saveDay } from '../history.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function buildHistory() {
  const history = {};
  let days = 0;
  let points = 0;
  for (const { entityId, days: dayList } of listArchives()) {
    history[entityId] = {};
    for (const day of dayList) {
      const list = readDay(entityId, day);
      history[entityId][day] = list;
      days += 1;
      points += list.length;
    }
  }
  return { history, entities: Object.keys(history).length, days, points };
}

function serializeHa(includeToken) {
  const ha = getHaConfig();
  if (!ha?.url) return null;
  let token = null;
  if (includeToken && ha.tokenEnc) {
    try {
      token = decryptSecret(ha.tokenEnc);
    } catch {
      token = null;
    }
  }
  return {
    url: ha.url,
    token,
    entities: Array.isArray(ha.entities) ? ha.entities : [],
    lastTestAt: ha.lastTestAt || null,
    lastMessage: ha.lastMessage || null,
  };
}

router.get('/', (req, res) => {
  const includeConfig = req.query.config !== '0';
  const { history, entities, days, points } = buildHistory();
  const backup = {
    app: 'geoloc',
    version: 1,
    exportedAt: new Date().toISOString(),
    homeAssistant: includeConfig ? serializeHa(req.query.token !== '0') : null,
    history,
  };
  res.json({ backup, stats: { entities, days, points } });
});

router.post('/', (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object' || !payload.history || typeof payload.history !== 'object') {
    return res.status(400).json({ error: 'invalid_backup', message: 'Fichier de sauvegarde invalide.' });
  }

  let entities = 0;
  let days = 0;
  let added = 0;
  let duplicates = 0;
  let invalidDays = 0;

  for (const [entityId, dayMap] of Object.entries(payload.history)) {
    if (!entityId || !dayMap || typeof dayMap !== 'object') continue;
    let touched = false;
    for (const [day, list] of Object.entries(dayMap)) {
      if (!DAY_PATTERN.test(day) || !Array.isArray(list)) {
        invalidDays += 1;
        continue;
      }
      const points = list.filter(
        (point) =>
          point &&
          point.timestamp &&
          Number.isFinite(Number(point.latitude)) &&
          Number.isFinite(Number(point.longitude)),
      );
      const before = readDay(entityId, day).length;
      const total = saveDay(entityId, day, points);
      const inserted = Math.max(0, total - before);
      added += inserted;
      duplicates += Math.max(0, points.length - inserted);
      days += 1;
      touched = true;
    }
    if (touched) entities += 1;
  }

  let configRestored = false;
  const ha = payload.homeAssistant;
  if (ha && ha.url) {
    const current = getHaConfig();
    const url = String(ha.url).replace(/\/+$/, '');
    const tokenEnc = ha.token ? encryptSecret(String(ha.token)) : current?.tokenEnc || null;
    if (tokenEnc) {
      setHaConfig({
        url,
        tokenEnc,
        lastTestAt: ha.lastTestAt || current?.lastTestAt || null,
        lastMessage: ha.lastMessage || current?.lastMessage || null,
        entities: Array.isArray(ha.entities) ? ha.entities.map(String) : [],
      });
      configRestored = true;
    }
  }

  res.json({ ok: true, entities, days, added, duplicates, invalidDays, configRestored });
});

export default router;
