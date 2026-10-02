import { config } from './config.js';
import { db } from './db.js';
import { haversineKm } from './motion.js';
import { hashPassword } from './utils/password.js';

function rowToUser(row) {
  if (!row) return undefined;
  let selectedEntities = [];
  try {
    selectedEntities = JSON.parse(row.selected_entities || '[]');
  } catch {
    selectedEntities = [];
  }
  if (!Array.isArray(selectedEntities)) selectedEntities = [];
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    active: Boolean(row.active),
    selectedEntity: row.selected_entity || selectedEntities[0] || null,
    selectedEntities,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export function listUsers() {
  return db
    .prepare('SELECT * FROM users ORDER BY id')
    .all()
    .map(rowToUser);
}

export function findUserByIdentifier(identifier) {
  const value = String(identifier || '').trim().toLowerCase();
  if (!value) return undefined;
  const row = db
    .prepare('SELECT * FROM users WHERE lower(username) = ? OR lower(email) = ? LIMIT 1')
    .get(value, value);
  return rowToUser(row);
}

export function findUserById(id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  return rowToUser(row);
}

export function countAdmins() {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1")
    .get();
  return row?.count || 0;
}

export function createUser({ username, email, password, role }) {
  const info = db
    .prepare(
      `INSERT INTO users (username, email, password_hash, role, active, selected_entity, selected_entities, created_at, last_login_at)
       VALUES (?, ?, ?, ?, 1, NULL, '[]', ?, NULL)`,
    )
    .run(
      String(username).trim(),
      email ? String(email).trim() : null,
      hashPassword(password),
      role === 'admin' ? 'admin' : 'user',
      new Date().toISOString(),
    );
  return findUserById(Number(info.lastInsertRowid));
}

export function updateUser(id, patch) {
  const user = findUserById(id);
  if (!user) return null;
  if (patch.email !== undefined) {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(
      patch.email ? String(patch.email).trim() : null,
      user.id,
    );
  }
  if (patch.role !== undefined) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(
      patch.role === 'admin' ? 'admin' : 'user',
      user.id,
    );
  }
  if (patch.active !== undefined) {
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(patch.active ? 1 : 0, user.id);
  }
  if (patch.password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(patch.password),
      user.id,
    );
  }
  return findUserById(user.id);
}

export function deleteUser(id) {
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(Number(id));
  return info.changes > 0;
}

export function touchLogin(id) {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    Number(id),
  );
}

export function setUserSelectedEntities(id, entityIds) {
  const user = findUserById(id);
  if (!user) return [];
  const list = [...new Set((entityIds || []).map((value) => String(value)).filter(Boolean))];
  db.prepare('UPDATE users SET selected_entities = ?, selected_entity = ? WHERE id = ?').run(
    JSON.stringify(list),
    list[0] || null,
    user.id,
  );
  return list;
}

export function hasEmptyDay(entityId, day) {
  const row = db
    .prepare('SELECT 1 AS present FROM empty_days WHERE entity_id = ? AND day = ?')
    .get(String(entityId), String(day));
  return Boolean(row);
}

export function markEmptyDay(entityId, day) {
  db.prepare('INSERT OR IGNORE INTO empty_days (entity_id, day) VALUES (?, ?)').run(
    String(entityId),
    String(day),
  );
}

export function clearEmptyDay(entityId, day) {
  db.prepare('DELETE FROM empty_days WHERE entity_id = ? AND day = ?').run(
    String(entityId),
    String(day),
  );
}

export function deletedPointsFor(entityId) {
  return db
    .prepare('SELECT timestamp FROM deleted_points WHERE entity_id = ? ORDER BY timestamp')
    .all(String(entityId))
    .map((row) => row.timestamp);
}

export function markPointDeleted(entityId, timestamp) {
  db.prepare('INSERT OR IGNORE INTO deleted_points (entity_id, timestamp) VALUES (?, ?)').run(
    String(entityId),
    String(timestamp),
  );
}

export function readSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

export function writeSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, JSON.stringify(value));
}

export function getHaConfig() {
  return readSetting('ha');
}

export function setHaConfig(ha) {
  writeSetting('ha', ha);
}

export function setHaEntities(entityIds) {
  const ha = getHaConfig();
  if (!ha) return null;
  ha.entities = [...new Set((entityIds || []).map(String))];
  ha.entitiesUpdatedAt = new Date().toISOString();
  setHaConfig(ha);
  return ha.entities;
}

export function getFilters() {
  return readSetting('filters');
}

export function setFilters(patch) {
  const maxSpeedKmh = Number(patch?.maxSpeedKmh);
  const anomalyMinKm = Number(patch?.anomalyMinKm);
  const filters = {
    maxSpeedKmh:
      Number.isFinite(maxSpeedKmh) && maxSpeedKmh > 0 ? maxSpeedKmh : config.maxSpeedKmh,
    anomalyMinKm:
      Number.isFinite(anomalyMinKm) && anomalyMinKm > 0 ? anomalyMinKm : config.anomalyMinKm,
  };
  writeSetting('filters', filters);
  return filters;
}

const LABEL_MATCH_KM = 0.15;

function rowToLabel(row) {
  return {
    latitude: row.latitude,
    longitude: row.longitude,
    name: row.name,
    placeId: row.place_id,
    updatedAt: row.updated_at,
  };
}

export function listPlaceLabels() {
  return db
    .prepare('SELECT * FROM place_labels ORDER BY updated_at')
    .all()
    .map(rowToLabel);
}

export function upsertPlaceLabel({ latitude, longitude, name, placeId }) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const label = String(name || '').trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !label) return null;

  const existing = listPlaceLabels().find(
    (item) => haversineKm(item.latitude, item.longitude, lat, lng) <= LABEL_MATCH_KM,
  );
  const updatedAt = new Date().toISOString();
  if (existing) {
    db.prepare(
      'UPDATE place_labels SET latitude = ?, longitude = ?, name = ?, place_id = ?, updated_at = ? WHERE latitude = ? AND longitude = ?',
    ).run(lat, lng, label, placeId != null ? String(placeId) : null, updatedAt, existing.latitude, existing.longitude);
  } else {
    db.prepare(
      'INSERT INTO place_labels (latitude, longitude, name, place_id, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(lat, lng, label, placeId != null ? String(placeId) : null, updatedAt);
  }
  return listPlaceLabels();
}

export function removePlaceLabel(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return listPlaceLabels();
  const matches = listPlaceLabels().filter(
    (item) => haversineKm(item.latitude, item.longitude, lat, lng) <= LABEL_MATCH_KM,
  );
  for (const match of matches) {
    db.prepare('DELETE FROM place_labels WHERE latitude = ? AND longitude = ?').run(
      match.latitude,
      match.longitude,
    );
  }
  return listPlaceLabels();
}
