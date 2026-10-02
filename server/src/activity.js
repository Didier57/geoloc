import { db } from './db.js';

const MAX_ENTRIES = 500;

export function logActivity(type, message) {
  try {
    db.prepare('INSERT INTO activity (at, type, message) VALUES (?, ?, ?)').run(
      new Date().toISOString(),
      String(type || 'info'),
      message != null ? String(message) : null,
    );
    // On ne conserve qu'un nombre raisonnable d'entrees.
    db.prepare(
      'DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT ?)',
    ).run(MAX_ENTRIES);
  } catch (err) {
    console.error(`[activity] enregistrement impossible : ${err.message}`);
  }
}

export function listActivity(limit = 100) {
  const count = Math.min(MAX_ENTRIES, Math.max(1, Number(limit) || 100));
  return db
    .prepare('SELECT id, at, type, message FROM activity ORDER BY id DESC LIMIT ?')
    .all(count);
}

export function clearActivity() {
  db.prepare('DELETE FROM activity').run();
}
