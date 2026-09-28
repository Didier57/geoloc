import { describe, test, expect } from 'vitest';
import { computeTrackStats, formatDistanceKm, formatDurationMs } from './stats.js';

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
    const points = line(1, 8);
    points[4] = point(0.072, 4);
    const stats = computeTrackStats({ points });
    expect(stats.maxSpeedKmh).toBeLessThan(100);
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
