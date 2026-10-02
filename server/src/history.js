import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';

const DIR = path.join(path.dirname(config.dataFile), 'history');

function safeEntityId(entityId) {
  return String(entityId).replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function dayFile(entityId, day) {
  return path.join(DIR, safeEntityId(entityId), `${day}.json`);
}

export function historyDir() {
  return DIR;
}

function writeJson(entityId, day, list) {
  try {
    const file = dayFile(entityId, day);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error(`[history] écriture JSON impossible (${entityId} ${day}) : ${err.message}`);
  }
}

function normalizePoint(point) {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  if (!point?.timestamp || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { timestamp: String(point.timestamp), latitude, longitude };
}

export function hasDay(entityId, day) {
  const row = db
    .prepare('SELECT 1 AS present FROM points WHERE entity_id = ? AND day = ? LIMIT 1')
    .get(String(entityId), String(day));
  return Boolean(row);
}

export function readDay(entityId, day) {
  return db
    .prepare('SELECT data FROM points WHERE entity_id = ? AND day = ? ORDER BY timestamp')
    .all(String(entityId), String(day))
    .map((row) => {
      try {
        return JSON.parse(row.data);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function saveDay(entityId, day, points) {
  const insert = db.prepare(
    'INSERT OR REPLACE INTO points (entity_id, day, timestamp, latitude, longitude, data) VALUES (?, ?, ?, ?, ?, ?)',
  );
  let count = 0;
  for (const point of points || []) {
    const normalized = normalizePoint(point);
    if (!normalized) continue;
    insert.run(
      String(entityId),
      String(day),
      normalized.timestamp,
      normalized.latitude,
      normalized.longitude,
      JSON.stringify(point),
    );
    count += 1;
  }
  writeJson(entityId, day, readDay(entityId, day));
  return count;
}

export function overwriteDay(entityId, day, points) {
  const insert = db.prepare(
    'INSERT OR REPLACE INTO points (entity_id, day, timestamp, latitude, longitude, data) VALUES (?, ?, ?, ?, ?, ?)',
  );
  db.prepare('DELETE FROM points WHERE entity_id = ? AND day = ?').run(String(entityId), String(day));
  for (const point of points || []) {
    const normalized = normalizePoint(point);
    if (!normalized) continue;
    insert.run(
      String(entityId),
      String(day),
      normalized.timestamp,
      normalized.latitude,
      normalized.longitude,
      JSON.stringify(point),
    );
  }
  const list = readDay(entityId, day);
  writeJson(entityId, day, list);
  return list.length;
}

export function deletePoint(entityId, day, timestamp) {
  const info = db
    .prepare('DELETE FROM points WHERE entity_id = ? AND day = ? AND timestamp = ?')
    .run(String(entityId), String(day), String(timestamp));
  if (info.changes === 0) return 0;
  writeJson(entityId, day, readDay(entityId, day));
  return info.changes;
}

export function listArchives() {
  const rows = db
    .prepare('SELECT DISTINCT entity_id FROM points')
    .all()
    .map((row) => row.entity_id);
  const result = [];
  for (const entityId of rows) {
    const days = db
      .prepare('SELECT DISTINCT day FROM points WHERE entity_id = ? ORDER BY day')
      .all(entityId)
      .map((row) => row.day)
      .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));
    result.push({ entityId, days });
  }
  return result;
}

export function latestPointMs(entityId) {
  const row = db
    .prepare('SELECT MAX(timestamp) AS last FROM points WHERE entity_id = ?')
    .get(String(entityId));
  const ms = row?.last ? new Date(row.last).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

export function archivedDays(entityIds) {  const result = new Map();
  for (const id of entityIds) {
    const days = db
      .prepare('SELECT DISTINCT day FROM points WHERE entity_id = ?')
      .all(String(id))
      .map((row) => row.day);
    result.set(id, new Set(days));
  }
  return result;
}

function readJsonDay(entityId, day) {
  try {
    const raw = fs.readFileSync(dayFile(entityId, day), 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function migrateFromJson() {
  const already = db.prepare("SELECT value FROM settings WHERE key = 'migrated_json'").get();
  if (already) return { migrated: false };
  let entities = [];
  try {
    entities = fs
      .readdirSync(DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    db.prepare("INSERT INTO settings (key, value) VALUES ('migrated_json', 'true')").run();
    return { migrated: false };
  }
  const insert = db.prepare(
    'INSERT OR IGNORE INTO points (entity_id, day, timestamp, latitude, longitude, data) VALUES (?, ?, ?, ?, ?, ?)',
  );
  let days = 0;
  db.exec('BEGIN');
  try {
    for (const dirName of entities) {
      let files = [];
      try {
        files = fs.readdirSync(path.join(DIR, dirName));
      } catch {
        files = [];
      }
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const day = file.slice(0, -5);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        const points = readJsonDay(dirName, day);
        let inserted = false;
        for (const point of points) {
          const normalized = normalizePoint(point);
          if (!normalized) continue;
          insert.run(
            dirName,
            day,
            normalized.timestamp,
            normalized.latitude,
            normalized.longitude,
            JSON.stringify(point),
          );
          inserted = true;
        }
        if (inserted) days += 1;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(`[history] migration JSON -> SQLite échouée : ${err.message}`);
    return { migrated: false };
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('migrated_json', 'true')").run();
  if (days > 0) console.log(`[history] migration JSON -> SQLite : ${days} jour(s)`);
  return { migrated: days > 0, days };
}
