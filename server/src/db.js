import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

const dir = dirname(config.dbFile);
if (dir && dir !== '.' && !existsSync(dir)) mkdirSync(dir, { recursive: true });

export const db = new DatabaseSync(config.dbFile);
try {
  db.exec('PRAGMA journal_mode = WAL;');
} catch (err) {
  console.warn(`[db] WAL indisponible, mode par défaut : ${err.message}`);
}
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    active INTEGER NOT NULL DEFAULT 1,
    selected_entity TEXT,
    selected_entities TEXT NOT NULL DEFAULT '[]',
    created_at TEXT,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS empty_days (
    entity_id TEXT NOT NULL,
    day TEXT NOT NULL,
    PRIMARY KEY (entity_id, day)
  );

  CREATE TABLE IF NOT EXISTS deleted_points (
    entity_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    PRIMARY KEY (entity_id, timestamp)
  );

  CREATE TABLE IF NOT EXISTS place_labels (
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    name TEXT NOT NULL,
    place_id TEXT,
    updated_at TEXT,
    PRIMARY KEY (latitude, longitude)
  );

  CREATE TABLE IF NOT EXISTS points (
    entity_id TEXT NOT NULL,
    day TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (entity_id, day, timestamp)
  );

  CREATE INDEX IF NOT EXISTS idx_points_day ON points (entity_id, day);
`);

export function closeDb() {
  try {
    db.close();
  } catch {
    /* ignore */
  }
}

export function usersCount() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  return Number(row?.n || 0);
}

export function restoreStateFromJsonIfEmpty() {
  if (usersCount() > 0 || !existsSync(config.dataFile)) return { restored: false };
  db.prepare("DELETE FROM settings WHERE key = 'migrated_state'").run();
  const result = migrateStateFromJson();
  if (result.migrated) console.log('[db] état restauré depuis geoloc.json');
  return { restored: result.migrated };
}

export function migrateStateFromJson() {
  const already = db.prepare("SELECT value FROM settings WHERE key = 'migrated_state'").get();
  if (already || !existsSync(config.dataFile)) return { migrated: false };

  let state;
  try {
    state = JSON.parse(readFileSync(config.dataFile, 'utf8'));
  } catch (err) {
    console.error(`[db] migration état impossible : ${err.message}`);
    return { migrated: false };
  }

  if (Array.isArray(state.users)) {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO users (id, username, email, password_hash, role, active, selected_entity, selected_entities, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const user of state.users) {
      insert.run(
        Number(user.id),
        String(user.username),
        user.email || null,
        user.passwordHash || '',
        user.role === 'admin' ? 'admin' : 'user',
        user.active === false ? 0 : 1,
        user.selectedEntity || null,
        JSON.stringify(Array.isArray(user.selectedEntities) ? user.selectedEntities : []),
        user.createdAt || null,
        user.lastLoginAt || null,
      );
    }
  }

  if (state.ha) {
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('ha', ?)",
    ).run(JSON.stringify(state.ha));
  }
  if (state.filters) {
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('filters', ?)",
    ).run(JSON.stringify(state.filters));
  }

  if (state.emptyDays && typeof state.emptyDays === 'object') {
    const insert = db.prepare('INSERT OR IGNORE INTO empty_days (entity_id, day) VALUES (?, ?)');
    for (const [entityId, days] of Object.entries(state.emptyDays)) {
      for (const day of Array.isArray(days) ? days : []) insert.run(String(entityId), String(day));
    }
  }

  if (state.deletedPoints && typeof state.deletedPoints === 'object') {
    const insert = db.prepare(
      'INSERT OR IGNORE INTO deleted_points (entity_id, timestamp) VALUES (?, ?)',
    );
    for (const [entityId, list] of Object.entries(state.deletedPoints)) {
      for (const timestamp of Array.isArray(list) ? list : []) {
        insert.run(String(entityId), String(timestamp));
      }
    }
  }

  if (Array.isArray(state.placeLabels)) {
    const insert = db.prepare(
      'INSERT OR IGNORE INTO place_labels (latitude, longitude, name, place_id, updated_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (const label of state.placeLabels) {
      const lat = Number(label?.latitude);
      const lng = Number(label?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !label?.name) continue;
      insert.run(lat, lng, String(label.name), label.placeId != null ? String(label.placeId) : null, label.updatedAt || null);
    }
  }

  db.prepare("INSERT INTO settings (key, value) VALUES ('migrated_state', 'true')").run();
  console.log('[db] migration geoloc.json -> SQLite effectuée');
  return { migrated: true };
}
