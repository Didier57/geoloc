import { config } from './config.js';

let activeZone = config.timeZone || 'Europe/Paris';
try {
  new Intl.DateTimeFormat('en-CA', { timeZone: activeZone }).format(new Date());
} catch {
  console.warn(`[dates] fuseau horaire invalide "${activeZone}", utilisation de Europe/Paris`);
  activeZone = 'Europe/Paris';
}

function partsOf(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const { type, value } of formatter.formatToParts(date)) parts[type] = value;
  return parts;
}

function offsetMs(date, timeZone) {
  const parts = partsOf(date, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

function startOfDayInstant(day, timeZone) {
  const [year, month, date] = day.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, date, 0, 0, 0, 0);
  let ts = guess - offsetMs(new Date(guess), timeZone);
  ts = guess - offsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

export function toDayString(date, timeZone = activeZone) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const parts = partsOf(d, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function todayString() {
  return toDayString(new Date());
}

export function dayStart(day) {
  return startOfDayInstant(day, activeZone);
}

export function dayEnd(day) {
  return new Date(startOfDayInstant(shiftDay(day, 1), activeZone).getTime() - 1);
}

export function shiftDay(day, delta) {
  const [year, month, date] = day.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, date));
  base.setUTCDate(base.getUTCDate() + delta);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const d = String(base.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function listDays(from, to) {
  const start = toDayString(from);
  const end = toDayString(to);
  if (!start || !end) return [];
  const days = [];
  let cursor = start;
  while (cursor <= end && days.length < 400) {
    days.push(cursor);
    cursor = shiftDay(cursor, 1);
  }
  return days;
}

export function recentDays(count) {
  const days = [];
  let cursor = todayString();
  for (let i = 0; i < count; i += 1) {
    cursor = shiftDay(cursor, -1);
    days.unshift(cursor);
  }
  return days;
}
