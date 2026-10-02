import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { migrateStateFromJson, restoreStateFromJsonIfEmpty } from './db.js';
import { migrateFromJson, restorePointsFromJsonIfEmpty } from './history.js';
import { databaseHealth, startDatabaseBackups } from './db-backup.js';
import { writeSetting } from './store.js';
import { ensureAdmin } from './bootstrap.js';
import { startArchiver } from './archive.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import configRoutes from './routes/config.js';
import geolocRoutes from './routes/geoloc.js';
import backupRoutes from './routes/backup.js';
import importRoutes from './routes/import.js';

const app = express();

process.on('uncaughtException', (err) => {
  console.error('[fatal] exception non capturée:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[fatal] promesse rejetée non capturée:', err);
});

app.use(cors({ origin: config.appUrl, credentials: true }));
app.use(cookieParser());
app.use('/api/backup', express.json({ limit: '200mb' }), backupRoutes);
app.use('/api/geoloc/import', express.raw({ type: () => true, limit: '500mb' }), importRoutes);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/config/ha', configRoutes);
app.use('/api/geoloc', geolocRoutes);

app.use((req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'file_too_large',
      message: 'Fichier trop volumineux pour le serveur.',
    });
  }
  return res.status(err.status || 500).json({ error: 'server_error', message: err.message });
});

app.listen(config.port, () => {
  console.log(`[server] à l'écoute sur le port ${config.port}`);

  const integrity = databaseHealth();
  try {
    writeSetting('db_health', { at: new Date().toISOString(), ...integrity });
  } catch (err) {
    console.error(`[db] statut de santé non enregistré : ${err.message}`);
  }
  if (!integrity.ok) console.error(`[db] integrity_check : ${integrity.message}`);

  try {
    migrateStateFromJson();
    restoreStateFromJsonIfEmpty();
  } catch (err) {
    console.error(`[db] migration état échouée : ${err.message}`);
  }
  try {
    migrateFromJson();
    restorePointsFromJsonIfEmpty();
  } catch (err) {
    console.error(`[history] migration historique échouée : ${err.message}`);
  }
  ensureAdmin();
  startArchiver();
  try {
    startDatabaseBackups();
  } catch (err) {
    console.error(`[db] sauvegardes périodiques indisponibles : ${err.message}`);
  }
});
