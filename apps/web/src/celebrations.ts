export function daysUntilCelebration(value: string | null, anniversary = false, now = new Date()): number | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  let nextYear = now.getFullYear();
  let next = Date.UTC(nextYear, month - 1, day);
  if (next < today) next = Date.UTC(++nextYear, month - 1, day);
  if (anniversary && nextYear <= year) return null;
  return Math.round((next - today) / 86400000);
}
