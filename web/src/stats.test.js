import { describe, test, expect } from 'vitest';
import { computeTrackStats, formatDistanceKm, formatDurationMs } from './stats.js';
import { filterAnomalies } from './motion.js';

const t0 = new Date('2026-01-15T10:00:00Z').getTime();
const point = (latitude, minutes, mode = 'drive') => ({
  latitude,
  longitude: 0,
  timestamp: new Date(t0 + minutes * 60000).toISOString(),
  mode,
});

const line = (kilometresPerMinute, count) => {
  const step = kilometresPerMinute / 111.32;
  return Array.from({ length: count }, (_, i) =>
    point(Number((i * step).toFixed(6)), i),
  );
};

describe('formatDurationMs', () => {
  test('formate heures et minutes', () => {
    expect(formatDurationMs(0)).toBe('0 min');
    expect(formatDurationMs(90 * 60000)).toBe('1 h 30');
    expect(formatDurationMs(120 * 60000)).toBe('2 h');
  });
});

describe('formatDistanceKm', () => {
  test('passe en metres sous le kilometre', () => {
    expect(formatDistanceKm(0.273)).toBe('273 m');
    expect(formatDistanceKm(2.5)).toContain('km');
  });
});

describe('computeTrackStats', () => {
  test('additionne distance, duree et vitesses', () => {
    const stats = computeTrackStats({ points: line(1, 4) });
    expect(stats.pointCount).toBe(4);
    expect(stats.distanceKm).toBeCloseTo(3, 1);
    expect(stats.maxSpeedKmh).toBeCloseTo(60, 0);
    expect(stats.averageSpeedKmh).toBeCloseTo(60, 0);
    expect(stats.byMode.drive.distanceKm).toBeCloseTo(3, 1);
  });

  test('neutralise un pic GPS isole pour la vitesse max', () => {
    // En vrai, le serveur applique filterAnomalies avant l'affichage : on
    // reproduit ce pipeline pour tester des donnees realistes.
    const points = line(1, 8);
    points[4] = point(0.072, 4);
    const cleaned = filterAnomalies(points, { maxSpeedKmh: 200, anomalyMinKm: 1 });
    const stats = computeTrackStats({ points: cleaned });
    expect(stats.maxSpeedKmh).toBeLessThan(100);
  });

  test("l'immobilite avec derive GPS ne produit aucun trajet", () => {
    const t0local = new Date('2026-10-02T00:00:00Z').getTime();
    const home = (minutes, metres) => ({
      latitude: metres / 111320,
      longitude: 0,
      timestamp: new Date(t0local + minutes * 60000).toISOString(),
      mode: "still",
    });
    const points = [];
    for (let i = 0; i < 120; i += 1) points.push(home(i, 6 * Math.sin(i)));
    points.splice(60, 0, {
      latitude: 600 / 111320,
      longitude: 0,
      timestamp: new Date(t0local + 60.5 * 60000).toISOString(),
      mode: "drive",
    });
    const stats = computeTrackStats({ points });
    expect(stats.distanceKm).toBeLessThan(0.05);
    expect(stats.byMode.drive.distanceKm).toBeLessThan(0.05);
    expect(stats.movingMs).toBe(0);
    expect(stats.averageSpeedKmh).toBeLessThanOrEqual(stats.maxSpeedKmh);
  });

  test('conserve une vitesse elevee soutenue', () => {
    const stats = computeTrackStats({ points: line(1.5, 6) });
    expect(stats.maxSpeedKmh).toBeCloseTo(90, 0);
  });

  test('ventile le temps par mode', () => {
    const points = [point(0, 0, 'still'), point(0.009, 1, 'drive')];
    const stats = computeTrackStats({ points });
    expect(stats.byMode.drive.distanceKm).toBeCloseTo(1, 1);
    expect(stats.movingMs).toBe(60000);
  });
});
