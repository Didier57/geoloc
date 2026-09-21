export class DawarichError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'DawarichError';
    this.status = status;
  }
}

const BATCH_SIZE = 500;

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function requireConfig(cfg) {
  const base = normalizeUrl(cfg?.url);
  if (!base) throw new DawarichError('Adresse Dawarich manquante.');
  if (!cfg?.apiKey) throw new DawarichError('Clé API Dawarich manquante.');
  return base;
}

async function readError(res) {
  try {
    const data = await res.json();
    return data?.error || data?.message || null;
  } catch {
    return null;
  }
}

export async function testConnection(cfg) {
  const base = requireConfig(cfg);
  let res;
  try {
    res = await fetch(`${base}/api/v1/users/me?api_key=${encodeURIComponent(cfg.apiKey)}`, {
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    throw new DawarichError(`Connexion impossible à ${base} (${err.message}).`);
  }
  if (res.status === 401) throw new DawarichError('Clé API refusée par Dawarich (401).', 401);
  if (!res.ok) throw new DawarichError(`Dawarich a répondu ${res.status}.`, res.status);

  const data = await res.json().catch(() => null);
  const email = data?.user?.email || data?.email || null;
  return email ? `Connecté (${email})` : 'OK';
}

export function toFeature(point, deviceId) {
  const properties = { timestamp: new Date(point.timestamp).toISOString() };
  const accuracy = Number(point.accuracy);
  if (Number.isFinite(accuracy) && accuracy > 0) properties.horizontal_accuracy = accuracy;
  const altitude = Number(point.altitude);
  if (Number.isFinite(altitude)) properties.altitude = altitude;
  const speed = Number(point.speed);
  if (Number.isFinite(speed)) properties.speed = Math.round((speed / 3.6) * 100) / 100;
  if (deviceId) properties.device_id = String(deviceId);
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [Number(point.longitude), Number(point.latitude)],
    },
    properties,
  };
}

async function sendBatch(cfg, locations) {
  const base = requireConfig(cfg);
  const url = `${base}/api/v1/overland/batches?api_key=${encodeURIComponent(cfg.apiKey)}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ locations }),
    });
  } catch (err) {
    throw new DawarichError(`Connexion impossible à ${base} (${err.message}).`);
  }
  if (res.status === 401) throw new DawarichError('Clé API refusée par Dawarich (401).', 401);
  if (!res.ok) {
    const message = await readError(res);
    throw new DawarichError(message || `Dawarich a répondu ${res.status}.`, res.status);
  }
}

export async function sendPoints(cfg, features, { batchSize = BATCH_SIZE } = {}) {
  let sent = 0;
  let batches = 0;
  for (let index = 0; index < features.length; index += batchSize) {
    const chunk = features.slice(index, index + batchSize);
    await sendBatch(cfg, chunk);
    sent += chunk.length;
    batches += 1;
  }
  return { sent, batches };
}
