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

const app = express();

app.use(cors({ origin: config.appUrl, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/config/ha', configRoutes);
app.use('/api/geoloc', geolocRoutes);

app.use((req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  return res.status(err.status || 500).json({ error: 'server_error', message: err.message });
});

ensureAdmin();
startArchiver();

app.listen(config.port, () => {
  console.log(`[server] à l'écoute sur le port ${config.port}`);
});
