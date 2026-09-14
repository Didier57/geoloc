import { config } from './config.js';
import { getHaConfig } from './store.js';
import { decryptSecret } from './utils/crypto.js';
import { fetchHistory } from './homeassistant.js';
import { dayStart, dayEnd, shiftDay, todayString } from './dates.js';
import { hasDay, saveDay } from './history.js';

let timer = null;

function currentConfig() {
  const ha = getHaConfig();
  if (!ha?.url || !ha?.tokenEnc) return null;
  try {
    return { url: ha.url, token: decryptSecret(ha.tokenEnc) };
  } catch {
    return null;
  }
}

export async function runArchive() {
  const cfg = currentConfig();
  if (!cfg) return { archived: 0, skipped: 'ha_not_configured' };

  const entityIds = Array.isArray(getHaConfig()?.entities) ? getHaConfig().entities : [];
  if (entityIds.length === 0) return { archived: 0, skipped: 'no_entities' };

  const today = todayString();
  let archived = 0;
  let failures = 0;

  for (let offset = config.archiveBackfillDays; offset >= 1; offset -= 1) {
    const dayString = shiftDay(today, -offset);

    const missing = entityIds.filter((id) => !hasDay(id, dayString));
    if (missing.length === 0) continue;

    let tracks;
    try {
      tracks = await fetchHistory(cfg, missing, dayStart(dayString).toISOString(), dayEnd(dayString).toISOString());
    } catch (err) {
      failures += 1;
      console.error(`[archive] ${dayString} échec: ${err.message}`);
      continue;
    }

    const byEntity = new Map(tracks.map((track) => [track.entityId, track.points]));
    for (const id of missing) {
      saveDay(id, dayString, byEntity.get(id) || []);
      archived += 1;
    }
    console.log(`[archive] ${dayString}: ${missing.length} entité(s) archivée(s)`);
  }

  return { archived, failures };
}

function msUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function scheduleNext() {
  const delay = Math.max(1000, msUntilNextMidnight());
  timer = setTimeout(async () => {
    try {
      await runArchive();
    } catch (err) {
      console.error('[archive] erreur:', err.message);
    }
    scheduleNext();
  }, delay);
  if (timer.unref) timer.unref();
}

export function startArchiver() {
  console.log(
    `[archive] archivage quotidien à 00:00 (rattrapage ${config.archiveBackfillDays} jours au démarrage)`,
  );
  setTimeout(async () => {
    try {
      const result = await runArchive();
      if (result.archived) console.log(`[archive] rattrapage: ${result.archived} jour(s) archivé(s)`);
    } catch (err) {
      console.error('[archive] erreur rattrapage:', err.message);
    }
  }, 8000).unref?.();
  scheduleNext();
}

export function stopArchiver() {
  if (timer) clearTimeout(timer);
  timer = null;
}
