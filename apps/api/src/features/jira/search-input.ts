export function parseTicketQuery(input: string): { type: 'key'; value: string } | { type: 'number'; value: string } | { type: 'title'; value: string } {
  let value = input.trim();
  try { value = new URL(value).pathname.match(/\/browse\/([^/]+)/i)?.[1] || value; } catch { /* Plain ticket key or title. */ }
  const key = /^([a-z][a-z0-9_]*)\s*-\s*(\d+)$/i.exec(value);
  if (key) return { type: 'key', value: `${key[1].toUpperCase()}-${key[2]}` };
  if (/^\d+$/.test(value)) return { type: 'number', value };
  return { type: 'title', value: value.replace(/[^\p{L}\p{N}\s_-]/gu, ' ').trim() };
}
