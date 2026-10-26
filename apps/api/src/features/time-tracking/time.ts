export const TIMEZONE = 'Asia/Kolkata';
export function localDate(instant: string | Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
}
export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function weekStart(date = localDate()) {
  return addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
}
export function parseDuration(value: string): number {
  const input = value.trim().toLowerCase();
  const clock = /^(\d+):([0-5]\d)$/.exec(input);
  const units = /^(?:(\d+)h\s*)?(?:(\d+)m)?$/.exec(input);
  const minutes = clock ? Number(clock[1]) * 60 + Number(clock[2]) : units && (units[1] || units[2]) ? Number(units[1] || 0) * 60 + Number(units[2] || 0) : NaN;
  if (!Number.isSafeInteger(minutes) || minutes <= 0 || minutes > 1440) throw new Error('Enter a duration between 1m and 24h, such as 1h 30m or 1:30.');
  return minutes * 60;
}
export function startedAt(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Invalid work date or start time.');
  const instant = `${date}T${time}:00.000+0530`;
  if (!Number.isFinite(Date.parse(instant)) || localDate(instant) !== date) throw new Error('Invalid work date.');
  if (date > localDate()) throw new Error('Future work dates are not allowed.');
  return instant;
}
export function toAdf(text: string) {
  return { type: 'doc', version: 1, content: text.split('\n').map(line => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) };
}
export function fromAdf(node: any): string {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content || []).map(fromAdf).join(node.type === 'doc' ? '\n' : '');
}
