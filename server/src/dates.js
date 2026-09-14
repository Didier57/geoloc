export function toDayString(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayString() {
  return toDayString(new Date());
}

export function dayStart(day) {
  return new Date(`${day}T00:00:00`);
}

export function dayEnd(day) {
  return new Date(`${day}T23:59:59.999`);
}

export function shiftDay(day, delta) {
  const d = dayStart(day);
  d.setDate(d.getDate() + delta);
  return toDayString(d);
}

export function listDays(from, to) {
  const start = dayStart(toDayString(from));
  const end = dayStart(toDayString(to));
  const days = [];
  const cursor = new Date(start);
  while (cursor <= end && days.length < 400) {
    days.push(toDayString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function recentDays(count) {
  const days = [];
  const cursor = dayStart(todayString());
  for (let i = 0; i < count; i += 1) {
    cursor.setDate(cursor.getDate() - 1);
    days.unshift(toDayString(cursor));
  }
  return days;
}
