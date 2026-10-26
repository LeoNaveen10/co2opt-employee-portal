import 'dotenv/config';
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
const levels = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
type Level = keyof typeof levels;
// Deliberately allowlist metadata: never serialize arbitrary errors, SQL, or payloads.
const fields = new Set(['requestId', 'method', 'route', 'status', 'durationMs', 'aborted', 'errorType', 'errorCode', 'operationId', 'action', 'attempt', 'retry', 'upstreamStatus', 'port', 'signal', 'eventType', 'release', 'source']);
export function log(level: Level, event: string, metadata: Record<string, unknown> = {}) {
  const configured = process.env.LOG_LEVEL || 'info';
  const threshold = configured === 'silent' ? Infinity : levels[configured as Level] ?? levels.info;
  if (levels[level] < threshold) return;
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!fields.has(key)) continue;
    if (typeof value === 'string') safe[key] = value.slice(0, 200);
    else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) safe[key] = value;
  }
  const record = { timestamp: new Date().toISOString(), level, service: 'portal-api', environment: process.env.NODE_ENV || 'development', release: process.env.APP_RELEASE?.slice(0, 100), ...requestContext.getStore(), ...safe, event };
  (levels[level] >= levels.error ? process.stderr : process.stdout).write(`${JSON.stringify(record)}\n`);
}

export function errorMetadata(error: unknown) {
  // Even error messages and stacks can include tokens, connection strings, SQL and employee data.
  const known = error instanceof Error ? error.name : '';
  return { errorType: ['TypeError', 'RangeError', 'SyntaxError', 'SequelizeConnectionError', 'SequelizeConnectionRefusedError', 'SequelizeDatabaseError', 'SequelizeValidationError', 'ZodError', 'JiraError'].includes(known) ? known : 'Error' };
}
