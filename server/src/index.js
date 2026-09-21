import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { ensureAdmin } from './bootstrap.js';
import { startArchiver } from './archive.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import configRoutes from './routes/config.js';
import geolocRoutes from './routes/geoloc.js';
import backupRoutes from './routes/backup.js';
import importRoutes from './routes/import.js';
import dawarichRoutes from './routes/dawarich.js';

const app = express();

app.use(cors({ origin: config.appUrl, credentials: true }));
app.use(cookieParser());
app.use('/api/backup', express.json({ limit: '200mb' }), backupRoutes);
app.use('/api/geoloc/import', express.raw({ type: () => true, limit: '500mb' }), importRoutes);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/config/ha', configRoutes);
app.use('/api/dawarich', dawarichRoutes);
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

ensureAdmin();
startArchiver();

app.listen(config.port, () => {
  console.log(`[server] à l'écoute sur le port ${config.port}`);
});
