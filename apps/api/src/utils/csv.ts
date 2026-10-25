export function csvCell(value: string | number) {
  const text = String(value);
  const safeText = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}
