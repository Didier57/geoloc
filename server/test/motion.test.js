import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm,
  bearingDegrees,
  classifySpeed,
  impliedSpeedKmh,
  filterAnomalies,
  classifyTrack,
} from '../src/motion.js';

const at = (latitude, longitude, timestamp) => ({ latitude, longitude, timestamp });
const t0 = '2026-01-15T10:00:00Z';
const plus = (ms) => new Date(new Date(t0).getTime() + ms).toISOString();
const MIN = 60000;

test('haversineKm vaut 0 pour un point identique', () => {
  assert.equal(haversineKm(48.8566, 2.3522, 48.8566, 2.3522), 0);
});

test('haversineKm approxime Paris-Lyon (~392 km)', () => {
  const distance = haversineKm(48.8566, 2.3522, 45.764, 4.8357);
  assert.ok(distance > 390 && distance < 395, `distance=${distance}`);
});

test('bearingDegrees cardinal', () => {
  assert.equal(Math.round(bearingDegrees(0, 0, 1, 0)), 0);
  assert.equal(Math.round(bearingDegrees(0, 0, 0, 1)), 90);
  assert.equal(Math.round(bearingDegrees(1, 0, 0, 0)), 180);
});

test('classifySpeed respecte les seuils', () => {
  assert.equal(classifySpeed(1), 'still');
  assert.equal(classifySpeed(5), 'walk');
  assert.equal(classifySpeed(50), 'drive');
  assert.equal(classifySpeed(null), null);
  assert.equal(classifySpeed(Number.NaN), null);
});

test('impliedSpeedKmh calcule une vitesse', () => {
  const speed = impliedSpeedKmh(at(0, 0, t0), at(0.01, 0, plus(3600000)));
  assert.ok(speed > 1 && speed < 1.2, `speed=${speed}`);
  assert.equal(impliedSpeedKmh(at(0, 0, t0), at(0, 0, t0)), null);
});

test('filterAnomalies supprime un saut a vitesse impossible', () => {
  const points = [at(0, 0, t0), at(0.045, 0, plus(MIN)), at(0.09, 0, plus(2 * MIN))];
  const kept = filterAnomalies(points, { maxSpeedKmh: 200, anomalyMinKm: 1 });
  assert.equal(kept.length, 2);
  assert.equal(kept[kept.length - 1], points[2]);
});

test('filterAnomalies conserve un trajet plausible', () => {
  const points = [at(0, 0, t0), at(0.009, 0, plus(MIN)), at(0.018, 0, plus(2 * MIN))];
  const kept = filterAnomalies(points, { maxSpeedKmh: 200, anomalyMinKm: 1 });
  assert.equal(kept.length, 3);
});

test('filterAnomalies supprime un aller-retour GPS', () => {
  const points = [at(0, 0, t0), at(0.1, 0, plus(30 * MIN)), at(0.0005, 0, plus(60 * MIN))];
  const kept = filterAnomalies(points, { maxSpeedKmh: 200, anomalyMinKm: 1 });
  assert.equal(kept.length, 2);
});

test('filterAnomalies preserve les micro-ecarts (< distance mini)', () => {
  const points = [at(0, 0, t0), at(0.0009, 0, plus(1000)), at(0.0018, 0, plus(2000))];
  const kept = filterAnomalies(points, { maxSpeedKmh: 200, anomalyMinKm: 1 });
  assert.equal(kept.length, 3);
});

test('classifyTrack ajoute vitesse arrondie et mode', () => {
  const track = classifyTrack([at(0, 0, t0), at(0.009, 0, plus(MIN))]);
  assert.equal(track[0].mode, null);
  assert.equal(track[1].speed, 60);
  assert.equal(track[1].mode, 'drive');
});
