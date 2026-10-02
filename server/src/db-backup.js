import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';
import { writeSetting } from './store.js';

const BACKUP_DIR = path.join(path.dirname(config.dbFile), 'backups');

export function backupDir() {
  return BACKUP_DIR;
}

export function databaseHealth() {
  try {
    const row = db.prepare('PRAGMA integrity_check').get();
    const value = row?.integrity_check;
    return value === 'ok' ? { ok: true, message: 'ok' } : { ok: false, message: String(value) };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

export function listBackups() {
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((name) => name.endsWith('.db'))
      .map((name) => {
        const stat = fs.statSync(path.join(BACKUP_DIR, name));
        return { file: name, size: stat.size, at: stat.mtime.toISOString() };
      })
      .sort((a, b) => (a.at < b.at ? 1 : -1));
  } catch {
    return [];
  }
}

function pruneBackups() {
  const keep = Math.max(1, Number(config.dbBackupKeep) || 7);
  for (const item of listBackups().slice(keep)) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, item.file));
    } catch {
      /* ignore */
    }
  }
}

export function backupDatabase() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch {
      /* WAL peut ne pas être actif */
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(BACKUP_DIR, `geoloc-${stamp}.db`);
    fs.copyFileSync(config.dbFile, dest);
    const size = fs.statSync(dest).size;
    pruneBackups();
    const info = { at: new Date().toISOString(), file: path.basename(dest), size };
    writeSetting('db_backup_last', info);
    console.log(`[db] sauvegarde effectuée (${info.file}, ${Math.round(size / 1024)} Ko)`);
    return info;
  } catch (err) {
    console.error(`[db] sauvegarde impossible : ${err.message}`);
    return null;
  }
}

let timer = null;

export function startDatabaseBackups() {
  const hours = Math.max(1, Number(config.dbBackupIntervalHours) || 24);
  backupDatabase();
  if (timer) clearInterval(timer);
  timer = setInterval(backupDatabase, hours * 60 * 60 * 1000);
  if (timer.unref) timer.unref();
  return { intervalHours: hours };
}
