import type { ErrorRequestHandler } from 'express';
import { log, errorMetadata } from '../observability/logger';

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  const status = err?.type === 'entity.too.large' ? 413 : err?.type === 'entity.parse.failed' ? 400 : 500;
  log(status >= 500 ? 'error' : 'warn', 'http.request.error', { ...errorMetadata(err), status });
  if (res.headersSent) { next(err); return; }
  res.status(status).json({ message: status === 500 ? 'Internal server error' : 'Invalid request', requestId: res.getHeader('X-Request-ID') });
};
