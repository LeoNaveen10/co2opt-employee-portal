export function toISODate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function isISODate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function enumerateDates(start: string, end: string) {
  const dates: string[] = [];
  const current = toISODate(start);
  const finish = toISODate(end);
  while (current <= finish) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export function calculateLeaveDays(start: string, end: string) {
  return enumerateDates(start, end).filter((value) => {
    const weekday = toISODate(value).getUTCDay();
    return weekday !== 0 && weekday !== 6;
  }).length;
}
