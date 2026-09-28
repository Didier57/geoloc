import { describe, test, expect } from 'vitest';
import { splitSegments, toGeoJSON, toGPX, toKML } from './exporters.js';

const t0 = new Date('2026-01-15T10:00:00Z').getTime();
const point = (latitude, minutes) => ({
  latitude,
  longitude: 0,
  timestamp: new Date(t0 + minutes * 60000).toISOString(),
});

describe('splitSegments', () => {
  test('coupe la trace sur un trou de temps', () => {
    const points = [point(0, 0), point(0.001, 1), point(0.002, 40)];
    const segments = splitSegments(points);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toHaveLength(2);
    expect(segments[1]).toHaveLength(1);
  });

  test('coupe la trace sur un saut de distance', () => {
    const points = [point(0, 0), point(0.1, 1)];
    expect(splitSegments(points)).toHaveLength(2);
  });
});

describe('toGeoJSON', () => {
  test('produit une FeatureCollection de LineString', () => {
    const tracks = [{ entityId: 'x', points: [point(0, 0), point(0.001, 1)] }];
    const parsed = JSON.parse(toGeoJSON(tracks));
    expect(parsed.type).toBe('FeatureCollection');
    expect(parsed.features).toHaveLength(1);
    expect(parsed.features[0].geometry.type).toBe('LineString');
    expect(parsed.features[0].geometry.coordinates[0]).toHaveLength(2);
  });
});

describe('toGPX', () => {
  test('genere des points de trace et echappe le nom', () => {
    const tracks = [{ entityId: 'x', name: 'A & B', points: [point(0, 0), point(0.001, 1)] }];
    const gpx = toGPX(tracks);
    expect(gpx).toContain('<trkpt');
    expect(gpx).toContain('A &amp; B');
  });
});

describe('toKML', () => {
  test('genere un LineString', () => {
    const tracks = [{ entityId: 'x', points: [point(0, 0), point(0.001, 1)] }];
    expect(toKML(tracks)).toContain('<LineString>');
  });
});
