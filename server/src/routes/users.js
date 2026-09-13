import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth.js';
import {
  countAdmins,
  createUser,
  deleteUser,
  findUserById,
  findUserByIdentifier,
  listUsers,
  updateUser,
} from '../store.js';

const router = Router();
router.use(requireAuth, requireAdmin);

function publicUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

router.get('/', (req, res) => {
  res.json({ users: listUsers().map(publicUser) });
});

router.post('/', (req, res) => {
  const { username, email, password, role } = req.body || {};
  if (!username || String(username).trim().length < 3) {
    return res.status(400).json({ error: 'invalid_username', message: "Nom d'utilisateur trop court (3 caractères min)." });
  }
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'invalid_password', message: 'Mot de passe trop court (8 caractères min).' });
  }
  if (findUserByIdentifier(username)) {
    return res.status(409).json({ error: 'username_taken', message: "Ce nom d'utilisateur existe déjà." });
  }
  if (email && findUserByIdentifier(email)) {
    return res.status(409).json({ error: 'email_taken', message: 'Cet email est déjà utilisé.' });
  }
  const user = createUser({ username, email, password, role });
  return res.status(201).json({ user: publicUser(user) });
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = findUserById(id);
  if (!user) return res.status(404).json({ error: 'not_found' });

  const { email, role, active, password } = req.body || {};
  const demoting = role !== undefined && role !== 'admin' && user.role === 'admin';
  const deactivating = active === false && user.role === 'admin';
  if ((demoting || deactivating) && countAdmins() <= 1) {
    return res.status(400).json({ error: 'last_admin', message: 'Impossible de retirer le dernier administrateur.' });
  }
  if (password !== undefined && String(password).length < 8) {
    return res.status(400).json({ error: 'invalid_password', message: 'Mot de passe trop court (8 caractères min).' });
  }
  if (email && email !== user.email && findUserByIdentifier(email)) {
    return res.status(409).json({ error: 'email_taken', message: 'Cet email est déjà utilisé.' });
  }

  const updated = updateUser(id, { email, role, active, password });
  return res.json({ user: publicUser(updated) });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = findUserById(id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  if (id === req.user.id) {
    return res.status(400).json({ error: 'cannot_delete_self', message: 'Vous ne pouvez pas supprimer votre propre compte.' });
  }
  if (user.role === 'admin' && countAdmins() <= 1) {
    return res.status(400).json({ error: 'last_admin', message: 'Impossible de supprimer le dernier administrateur.' });
  }
  deleteUser(id);
  return res.json({ ok: true });
});

export default router;
