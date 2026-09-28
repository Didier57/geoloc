import { describe, test, expect } from 'vitest';
import { haversineKm, bearingDegrees, detectStays, modeColor } from './motion.js';

const t0 = new Date('2026-01-15T10:00:00Z').getTime();
const at = (latitude, longitude, minutes) => ({
  latitude,
  longitude,
  timestamp: new Date(t0 + minutes * 60000).toISOString(),
});

describe('haversineKm', () => {
  test('nul pour un point identique', () => {
    expect(haversineKm(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0);
  });

  test('approxime Paris-Lyon (~392 km)', () => {
    const distance = haversineKm(48.8566, 2.3522, 45.764, 4.8357);
    expect(distance).toBeGreaterThan(390);
    expect(distance).toBeLessThan(395);
  });
});

describe('bearingDegrees', () => {
  test('renvoie les caps cardinaux', () => {
    expect(Math.round(bearingDegrees(0, 0, 1, 0))).toBe(0);
    expect(Math.round(bearingDegrees(0, 0, 0, 1))).toBe(90);
    expect(Math.round(bearingDegrees(1, 0, 0, 0))).toBe(180);
  });
});

describe('modeColor', () => {
  test('retombe sur la couleur fournie', () => {
    expect(modeColor('drive')).toBe('#dc2626');
    expect(modeColor('inconnu', '#000')).toBe('#000');
  });
});

describe('detectStays', () => {
  test('detecte un arret immobile', () => {
    const points = Array.from({ length: 6 }, (_, i) => at(48.85, 2.35, i * 2));
    const stays = detectStays(points);
    expect(stays).toHaveLength(1);
    expect(stays[0].count).toBe(6);
    expect(stays[0].durationMs).toBe(10 * 60000);
  });

  test('ignore un deplacement continu', () => {
    const points = Array.from({ length: 6 }, (_, i) => at(48.85 + i * 0.02, 2.35, i * 2));
    expect(detectStays(points)).toHaveLength(0);
  });

  test("tolere des points parasites pendant l'arret", () => {
    const home = [0, 2, 4, 6].map((m) => at(48.85, 2.35, m));
    const stray = at(48.9, 2.35, 8);
    const back = [10, 12].map((m) => at(48.85, 2.35, m));
    const points = [...home, stray, ...back];
    const tolerant = detectStays(points, 0.2, 5, 1);
    expect(tolerant).toHaveLength(1);
    expect(tolerant[0].count).toBe(6);
    const strict = detectStays(points, 0.2, 5, 0);
    expect(strict).toHaveLength(1);
    expect(strict[0].count).toBe(4);
  });
});
