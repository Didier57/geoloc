import { config } from './config.js';
import { getHaConfig, getFilters, hasEmptyDay, markEmptyDay, clearEmptyDay } from './store.js';
import { decryptSecret } from './utils/crypto.js';
import { fetchHistory } from './homeassistant.js';
import { dayStart, dayEnd, shiftDay, todayString, toDayString } from './dates.js';
import { hasDay, latestPointMs, listArchives, overwriteDay, readDay, saveDay } from './history.js';
import { filterAnomalies } from './motion.js';
import { finishJob, getJob, startJob, stepJob, updateJob } from './jobs.js';

let timer = null;
let running = null;

function currentConfig() {
  const ha = getHaConfig();
  if (!ha?.url || !ha?.tokenEnc) return null;
  try {
    return { url: ha.url, token: decryptSecret(ha.tokenEnc) };
  } catch {
    return null;
  }
}

export async function runArchive({ force = false, all = false } = {}) {
  if (running) {
    console.log('[archive] archivage déjà en cours, requête ignorée');
    return { archived: 0, skipped: 'already_running' };
  }
  running = doArchive({ force, all });
  try {
    return await running;
  } finally {
    running = null;
  }
}

export function isArchiving() {
  return Boolean(running);
}

export function archiveInBackground({ force = false, all = false } = {}) {
  if (running) {
    console.log('[archive] archivage déjà en cours, requête ignorée');
    return { started: false, skipped: 'already_running' };
  }
  running = doArchive({ force, all })
    .catch((err) => {
      console.error('[archive] erreur en arrière-plan:', err.message);
      if (getJob().running) finishJob({ message: `Erreur : ${err.message}` });
      return null;
    })
    .finally(() => {
      running = null;
    });
  return { started: true };
}

async function doArchive({ force = false, all = false } = {}) {
  const cfg = currentConfig();
  if (!cfg) return { archived: 0, skipped: 'ha_not_configured' };

  const entityIds = Array.isArray(getHaConfig()?.entities) ? getHaConfig().entities : [];
  if (entityIds.length === 0) return { archived: 0, skipped: 'no_entities' };

  const today = todayString();
  const plan = [];

  if (force) {
    for (let offset = config.archiveBackfillDays; offset >= 1; offset -= 1) {
      const dayString = shiftDay(today, -offset);
      plan.push({ dayString, missing: entityIds, sinceMs: null });
    }
    plan.push({ dayString: today, missing: entityIds, sinceMs: null });
  } else {
    // Import incremental : pour chaque entite, on ne reinterroge Home Assistant
    // qu'a partir du dernier point deja connu (dernier horodatage en base) au
    // lieu de rebalayer toute la fenetre de rattrapage. Si aucun point n'est
    // connu, on relit la fenetre complete. Les jours sans donnees deja verifies
    // restent ignores (empty_days).
    const floorMs = dayStart(shiftDay(today, -config.archiveBackfillDays)).getTime();
    for (const id of entityIds) {
      const latest = latestPointMs(id);
      const sinceMs = latest != null ? Math.max(floorMs, latest) : null;
      const fromDay = sinceMs != null ? toDayString(new Date(sinceMs)) : shiftDay(today, -config.archiveBackfillDays);
      let cursor = fromDay;
      while (cursor <= today) {
        if (cursor === today) {
          plan.push({ dayString: cursor, missing: [id], sinceMs });
        } else if (!hasEmptyDay(id, cursor)) {
          plan.push({ dayString: cursor, missing: [id], sinceMs });
        }
        cursor = shiftDay(cursor, 1);
      }
    }
  }

  startJob('archive', 'Synchronisation', plan.length);
  let archived = 0;
  let failures = 0;

  for (const { dayString, missing, sinceMs } of plan) {
    updateJob({ message: `Jour ${dayString}` });

    const dayStartMs = dayStart(dayString).getTime();
    let effectiveStartMs = dayStartMs;
    if (sinceMs != null && sinceMs > dayStartMs) effectiveStartMs = sinceMs;
    if (force || sinceMs == null) effectiveStartMs = dayStartMs;

    let tracks;
    try {
      tracks = await fetchHistory(
        cfg,
        missing,
        new Date(effectiveStartMs).toISOString(),
        dayEnd(dayString).toISOString(),
      );
    } catch (err) {
      failures += 1;
      console.error(`[archive] ${dayString} échec: ${err.message}`);
      stepJob();
      updateJob({ failures });
      continue;
    }

    const byEntity = new Map(tracks.map((track) => [track.entityId, track.points]));
    for (const id of missing) {
      const points = byEntity.get(id) || [];
      if (points.length > 0) {
        saveDay(id, dayString, points);
        clearEmptyDay(id, dayString);
        archived += 1;
      } else if (!hasDay(id, dayString)) {
        markEmptyDay(id, dayString);
      }
    }
    const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
    console.log(`[archive] ${dayString}: ${missing.length} entité(s) traitée(s) — ${mem} Mo RSS`);
    stepJob();
    updateJob({ archived, failures });
  }

  let cleaned = null;
  if (all) {
    startJob('clean', 'Nettoyage des archives');
    cleaned = cleanArchives();
    finishJob({ archived: cleaned.removed, message: `${cleaned.removed} point(s) retiré(s)` });
    return { archived, failures, cleaned };
  }

  finishJob({ archived, failures, message: `${archived} jour(s) archivé(s)` });
  return { archived, failures, cleaned };
}

export function cleanArchives() {
  const archives = listArchives();
  const total = archives.reduce((sum, item) => sum + item.days.length, 0);
  updateJob({ total, done: 0 });
  let days = 0;
  let removed = 0;
  for (const { entityId, days: dayList } of archives) {
    for (const day of dayList) {
      const points = readDay(entityId, day);
      if (points.length > 0) {
        const cleaned = filterAnomalies(points, getFilters() || {});
        if (cleaned.length !== points.length) {
          overwriteDay(entityId, day, cleaned);
          removed += points.length - cleaned.length;
          days += 1;
        }
      }
      stepJob();
      updateJob({ archived: removed });
    }
  }
  if (removed > 0) console.log(`[archive] nettoyage: ${removed} point(s) sur ${days} jour(s)`);
  return { days, removed };
}

function msUntilNextMidnight() {
  const next = dayStart(shiftDay(todayString(), 1));
  return next.getTime() - Date.now();
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
