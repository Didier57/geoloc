import { classifyTrack, filterAnomalies } from './motion.js';

export class HomeAssistantError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'HomeAssistantError';
    this.status = status;
  }
}

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function request(cfg, path) {
  const base = normalizeUrl(cfg?.url);
  if (!base) throw new HomeAssistantError('Adresse Home Assistant manquante.');
  if (!cfg?.token) throw new HomeAssistantError('Token Home Assistant manquant.');

  let res;
  try {
    res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' },
    });
  } catch (err) {
    throw new HomeAssistantError(`Connexion impossible à ${base} (${err.message}).`);
  }

  if (res.status === 401) throw new HomeAssistantError('Token refusé par Home Assistant (401).', 401);
  if (!res.ok) throw new HomeAssistantError(`Home Assistant a répondu ${res.status}.`, res.status);

  return res.json();
}

export async function testConnection(cfg) {
  const data = await request(cfg, '/api/');
  return data?.message || 'OK';
}

export async function fetchStates(cfg) {
  const states = await request(cfg, '/api/states');
  return Array.isArray(states) ? states : [];
}

const TRACKABLE_DOMAINS = new Set(['person', 'device_tracker']);

export function mapTrackableEntities(states) {
  return states
    .map((s) => ({
      entityId: s.entity_id,
      name: s.attributes?.friendly_name || s.entity_id,
      domain: String(s.entity_id).split('.')[0],
      state: s.state,
      latitude: toNumber(s.attributes?.latitude),
      longitude: toNumber(s.attributes?.longitude),
      accuracy: toNumber(s.attributes?.gps_accuracy),
      battery: toNumber(s.attributes?.battery_level),
      source: s.attributes?.source || null,
      picture: s.attributes?.entity_picture || null,
      lastUpdated: s.last_updated || s.last_changed || null,
    }))
    .filter(
      (entity) =>
        TRACKABLE_DOMAINS.has(entity.domain) &&
        entity.latitude !== null &&
        entity.longitude !== null,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchHistory(cfg, entityIds, startIso, endIso) {
  const params = new URLSearchParams({ filter_entity_id: entityIds.join(',') });
  if (endIso) params.set('end_time', endIso);
  const data = await request(
    cfg,
    `/api/history/period/${encodeURIComponent(startIso)}?${params.toString()}`,
  );

  const tracks = [];
  if (!Array.isArray(data)) return tracks;

  const startMs = startIso ? new Date(startIso).getTime() : null;
  const endMs = endIso ? new Date(endIso).getTime() : null;

  for (const series of data) {
    if (!Array.isArray(series) || series.length === 0) continue;
    const first = series[0];
    const points = [];
    for (const st of series) {
      const latitude = toNumber(st.attributes?.latitude);
      const longitude = toNumber(st.attributes?.longitude);
      if (latitude === null || longitude === null) continue;
      const timestamp = st.last_changed || st.last_updated || null;
      if (timestamp) {
        const time = new Date(timestamp).getTime();
        if (startMs != null && time < startMs) continue;
        if (endMs != null && time > endMs) continue;
      }
      points.push({
        latitude,
        longitude,
        accuracy: toNumber(st.attributes?.gps_accuracy),
        battery: toNumber(st.attributes?.battery_level),
        state: st.state,
        timestamp,
      });
    }
    tracks.push({
      entityId: first.entity_id,
      name: first.attributes?.friendly_name || first.entity_id,
      points: classifyTrack(filterAnomalies(points)),
    });
  }

  return tracks;
}
