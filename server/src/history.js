import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

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

export function hasDay(entityId, day) {
  return fs.existsSync(dayFile(entityId, day));
}

export function readDay(entityId, day) {
  try {
    const raw = fs.readFileSync(dayFile(entityId, day), 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveDay(entityId, day, points) {
  const file = dayFile(entityId, day);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const merged = new Map();
  for (const point of [...readDay(entityId, day), ...(points || [])]) {
    if (point?.timestamp) merged.set(point.timestamp, point);
  }
  const list = [...merged.values()].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
  );
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list));
  fs.renameSync(tmp, file);
  return list.length;
}

export function archivedDays(entityIds) {
  const result = new Map();
  for (const id of entityIds) {
    const dir = path.join(DIR, safeEntityId(id));
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      entries = [];
    }
    result.set(
      id,
      new Set(
        entries
          .filter((name) => name.endsWith('.json'))
          .map((name) => name.slice(0, -5)),
      ),
    );
  }
  return result;
}
