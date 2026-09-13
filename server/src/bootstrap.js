import { config } from './config.js';
import { createUser, listUsers } from './store.js';

export function ensureAdmin() {
  const admins = listUsers().filter((u) => u.role === 'admin');
  if (admins.length > 0) return;

  if (!config.admin.password) {
    console.warn('[bootstrap] Aucun admin et ADMIN_PASSWORD non défini : aucun compte admin créé.');
    return;
  }

  const existing = listUsers().find(
    (u) => u.username.toLowerCase() === config.admin.username.toLowerCase(),
  );
  if (existing) return;

  createUser({
    username: config.admin.username,
    email: config.admin.email,
    password: config.admin.password,
    role: 'admin',
  });
  console.log(`[bootstrap] Compte admin « ${config.admin.username} » créé.`);
}
