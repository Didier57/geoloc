import test from 'node:test';
import assert from 'node:assert/strict';
import { toDayString, shiftDay, listDays, dayStart, dayEnd } from '../src/dates.js';

test('shiftDay traverse les mois et annees', () => {
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2024-02-28', 1), '2024-02-29');
});

test('listDays enumere les jours inclusifs', () => {
  assert.deepEqual(listDays('2026-01-01T00:00:00Z', '2026-01-03T12:00:00Z'), [
    '2026-01-01',
    '2026-01-02',
    '2026-01-03',
  ]);
  assert.deepEqual(listDays('', ''), []);
});

test('toDayString respecte le fuseau demande', () => {
  assert.equal(toDayString('2026-03-15T23:30:00Z', 'Europe/Paris'), '2026-03-16');
  assert.equal(toDayString('2026-03-15T22:30:00Z', 'Europe/Paris'), '2026-03-15');
});

test('dayStart/dayEnd bornent la journee en heure de Paris (hiver)', () => {
  assert.equal(dayStart('2026-01-15').toISOString(), '2026-01-14T23:00:00.000Z');
  assert.equal(dayEnd('2026-01-15').toISOString(), '2026-01-15T22:59:59.999Z');
});
