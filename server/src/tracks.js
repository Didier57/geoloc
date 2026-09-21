import {
  clearEmptyDay,
  deletedPointsFor,
  hasEmptyDay,
  markEmptyDay,
} from './store.js';
import { fetchHistory } from './homeassistant.js';
import { hasDay, readDay, saveDay } from './history.js';
import { dayEnd, dayStart, todayString } from './dates.js';
import { classifyTrack } from './motion.js';

export async function collectTracks(haConfig, entityIds, days) {
  const today = todayString();
  const dbPoints = new Map(entityIds.map((id) => [id, []]));
  const haPoints = new Map(entityIds.map((id) => [id, []]));
  const needsHa = new Map();
  let haError = null;
  let fromDb = false;
  let fromHa = false;

  for (const day of days) {
    const isPast = day < today;
    const startMs = dayStart(day).getTime();
    const endMs = dayEnd(day).getTime();
    const missing = [];
    for (const id of entityIds) {
      if (isPast && hasDay(id, day)) {
        const stored = readDay(id, day).filter((point) => {
          const time = point?.timestamp ? new Date(point.timestamp).getTime() : NaN;
          return Number.isFinite(time) && time >= startMs && time <= endMs;
        });
        if (stored.length > 0) {
          dbPoints.get(id).push(...stored);
          fromDb = true;
          continue;
        }
        if (!hasEmptyDay(id, day)) missing.push(id);
      } else if (isPast && hasEmptyDay(id, day)) {
        // Jour déjà vérifié et archivé sans données : inutile de réinterroger Home Assistant.
      } else if (day <= today) {
        missing.push(id);
      }
    }
    if (missing.length > 0) needsHa.set(day, missing);
  }

  if (haConfig) {
    for (const [day, missing] of needsHa) {
      let tracks;
      try {
        tracks = await fetchHistory(
          haConfig,
          missing,
          dayStart(day).toISOString(),
          dayEnd(day).toISOString(),
        );
      } catch (err) {
        haError = err.message;
        continue;
      }
      const byEntity = new Map(tracks.map((track) => [track.entityId, track.points]));
      for (const id of missing) {
        const points = byEntity.get(id) || [];
        if (day < today) {
          if (points.length > 0) {
            saveDay(id, day, points);
            clearEmptyDay(id, day);
          } else {
            markEmptyDay(id, day);
          }
        }
        haPoints.get(id).push(...points);
        if (points.length > 0) fromHa = true;
      }
    }
  }

  const tracks = entityIds.map((id) => {
    const merged = new Map();
    const deleted = new Set(deletedPointsFor(id));
    for (const point of [...dbPoints.get(id), ...haPoints.get(id)]) {
      if (!point?.timestamp) continue;
      if (deleted.has(String(point.timestamp))) continue;
      merged.set(point.timestamp, point);
    }
    const sorted = [...merged.values()].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
    );
    return { entityId: id, points: classifyTrack(sorted) };
  });

  const total = tracks.reduce((sum, track) => sum + track.points.length, 0);
  let source = 'none';
  if (total > 0) source = fromDb && fromHa ? 'mixed' : fromHa ? 'ha' : 'db';

  return { tracks, source, haError };
}
