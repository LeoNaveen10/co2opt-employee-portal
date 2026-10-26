export const API_BASE = `${window.location.protocol}//${window.location.hostname}:4000`;
type Event = 'browser.error' | 'browser.unhandled_rejection' | 'react.render_failed' | 'api.failed' | 'api.slow';
let started = Date.now();
let count = 0;
// Only fixed events and numeric metadata leave the browser. No messages, URLs or user data.
export function report(event: Event, metadata: { status?: number; durationMs?: number; requestId?: string } = {}) {
  if (Date.now() - started > 60000) { started = Date.now(); count = 0; }
  if (++count > 20) return;
  const record = { event, ...metadata };
  if (window.location.hostname === 'localhost') console.info(JSON.stringify({ service: 'portal-web', timestamp: new Date().toISOString(), ...record }));
  // No retry: monitoring must not amplify an API outage or recursively report itself.
  void fetch(`${API_BASE}/monitoring/events`, {
    method: 'POST', credentials: 'omit', keepalive: true,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record)
  }).catch(() => {});
}
export function installMonitoring() {
  window.addEventListener('error', () => report('browser.error'));
  window.addEventListener('unhandledrejection', () => report('browser.unhandled_rejection'));
}
export async function monitoredFetch(path: string, options: RequestInit = {}) {
  const start = performance.now();
  // getRandomValues also works on HTTP LAN deployments where randomUUID is unavailable.
  const requestId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, digit => (Number(digit) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(digit) / 4)))).toString(16));
  const headers = new Headers(options.headers);
  headers.set('X-Request-ID', requestId);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const durationMs = Math.round(performance.now() - start);
    const metadata = { status: response.status, durationMs, requestId: response.headers.get('X-Request-ID') || requestId };
    if (!response.ok) report('api.failed', metadata);
    else if (durationMs >= 3000) report('api.slow', metadata);
    return response;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) report('api.failed', { durationMs: Math.round(performance.now() - start), requestId });
    throw error;
  }
}
