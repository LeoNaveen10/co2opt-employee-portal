import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { log, requestContext } from './logger';

export const requestLogging: RequestHandler = (req, res, next) => {
  const incoming = req.get('X-Request-ID');
  const requestId = incoming && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-ID', requestId);
  const start = performance.now();
  let recorded = false;
  const complete = (aborted: boolean) => {
    if (recorded) return;
    recorded = true;
    const status = aborted ? 499 : res.statusCode;
    log(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', 'http.request.completed', {
      requestId, method: req.method, route: typeof req.route?.path === 'string' ? req.route.path : 'unmatched', status,
      durationMs: Math.round((performance.now() - start) * 100) / 100, aborted
    });
  };
  res.once('finish', () => complete(false));
  res.once('close', () => complete(!res.writableFinished));
  requestContext.run({ requestId }, next);
};
