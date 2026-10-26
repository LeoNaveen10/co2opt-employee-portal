import { Router, json } from 'express';
import { log } from './logger';

export const browserEvents = Router();
let windowStart = Date.now();
let received = 0;
// Process-wide cap also bounds anonymous traffic without retaining IP addresses.
browserEvents.post('/monitoring/events', json({ limit: '8kb' }), (req, res) => {
  if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); received = 0; }
  if (++received > 300) { res.setHeader('Retry-After', '60'); res.sendStatus(429); return; }
  const body = req.body;
  const allowed = ['browser.error', 'browser.unhandled_rejection', 'react.render_failed', 'api.failed', 'api.slow'];
  if (!body || !allowed.includes(body.event)) { res.sendStatus(400); return; }
  const status = Number.isInteger(body.status) && body.status >= 100 && body.status <= 599 ? body.status : undefined;
  const durationMs = typeof body.durationMs === 'number' && Number.isFinite(body.durationMs) && body.durationMs >= 0 ? Math.min(body.durationMs, 3600000) : undefined;
  const requestId = typeof body.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(body.requestId) ? body.requestId : undefined;
  log(body.event === 'api.slow' || (status && status < 500) ? 'warn' : 'error', 'frontend.event', {
    source: 'untrusted-browser', eventType: body.event, status, durationMs,
    // Correlation points to the failed API call; ingestion has its own HTTP request log.
    requestId, release: typeof body.release === 'string' && /^[\w.-]{1,100}$/.test(body.release) ? body.release : undefined
  });
  res.sendStatus(204);
});
