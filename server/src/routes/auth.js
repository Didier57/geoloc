import { Router } from 'express';
import { clearAuthCookie, requireAuth, setAuthCookie, signToken } from '../auth.js';
import { findUserById, findUserByIdentifier, setUserSelectedEntity, touchLogin } from '../store.js';
import { verifyPassword } from '../utils/password.js';

const router = Router();

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    selectedEntity: user.selectedEntity || null,
  };
}

router.post('/login', (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) {
    return res.status(400).json({ error: 'missing_credentials' });
  }
  const user = findUserByIdentifier(identifier);
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  touchLogin(user.id);
  setAuthCookie(res, signToken(user));
  return res.json({ user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user || !user.active) return res.status(401).json({ error: 'unauthenticated' });
  return res.json({ user: publicUser(user) });
});

router.post('/selection', requireAuth, (req, res) => {
  const entityId = req.body?.entityId ?? null;
  const selectedEntity = setUserSelectedEntity(req.user.id, entityId);
  return res.json({ ok: true, selectedEntity });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

export default router;
