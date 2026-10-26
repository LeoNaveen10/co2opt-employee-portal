export type Snapshot = { started: string; durationSeconds: number; description: string; remoteUpdated: string };
export type Ticket = { id: string; key: string; summary: string; project?: string };
export type Entry = { id: string; issueId: string; ticketKey: string; summary: string; ticketUrl: string; confirmed: Snapshot | null; desired: Snapshot | null; state: string; version: number; error: string | null; worklogId: string | null };
export type PendingCreation = { id: string; ticketKey: string; date: string; durationSeconds: number; status: string; error: string | null };
export type Week = { start: string; end: string; trackedDates?: string[]; totalSeconds: number | null; lastRefreshed: string | null; error: string | null; holidays: string[]; pendingCount?: number; pendingCreations?: PendingCreation[]; cachedTotalSeconds?: number; entries?: Entry[]; loading?: boolean };
export type ConnectionStatus = { configured: boolean; csrf: string; connection: { status: string; displayName: string; siteUrl: string } | null };
export const TIMEZONE = 'Asia/Kolkata';
export function localDate(value: string | Date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)); }
export function localTime(value: string) { return new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)); }
export function addDays(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
export function currentWeek() { const date = localDate(); return addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay()); }
export function duration(value: number) {
  const hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60), seconds = value % 60;
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', seconds ? `${seconds}s` : ''].filter(Boolean).join(' ') || '0h';
}
export function previewDuration(value: string) {
  const clock = /^(\d+):([0-5]\d)$/.exec(value.trim());
  const units = /^(?:(\d+)h\s*)?(?:(\d+)m)?$/i.exec(value.trim());
  const minutes = clock ? +clock[1] * 60 + +clock[2] : units && (units[1] || units[2]) ? +(units[1] || 0) * 60 + +(units[2] || 0) : NaN;
  return Number.isSafeInteger(minutes) && minutes > 0 && minutes <= 1440 ? duration(minutes * 60) : null;
}
export function dateLabel(value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) { return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' }); }
export function weekLabel(start: string) { return start === currentWeek() ? 'This Week' : start === addDays(currentWeek(), -7) ? 'Last Week' : `${dateLabel(start, { month: 'short', day: 'numeric', ...(start.slice(0, 4) !== currentWeek().slice(0, 4) ? { year: 'numeric' } : {}) })} – ${dateLabel(addDays(start, 6), { month: 'short', day: 'numeric', ...(addDays(start, 6).slice(0, 4) !== start.slice(0, 4) ? { year: 'numeric' } : {}) })}`; }
