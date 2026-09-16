import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth.js';
import { importTakeout } from '../takeout.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

router.post('/', (req, res) => {
  const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (buffer.length === 0) {
    return res.status(400).json({ error: 'empty_file', message: 'Aucun fichier reçu.' });
  }

  const entityId = String(req.query.entityId || '').trim();
  if (!entityId) {
    return res.status(400).json({ error: 'missing_entity', message: 'Choisissez le device à compléter.' });
  }

  const from = DAY_PATTERN.test(String(req.query.from || '')) ? String(req.query.from) : null;
  const to = DAY_PATTERN.test(String(req.query.to || '')) ? String(req.query.to) : null;
  if (from && to && from > to) {
    return res.status(400).json({ error: 'invalid_range', message: 'La date de début doit précéder la date de fin.' });
  }

  try {
    const stats = importTakeout({ entityId, buffer, from, to });
    res.json({ ok: true, ...stats, from, to });
  } catch (err) {
    res.status(400).json({ error: 'import_failed', message: err.message });
  }
});

export default router;
