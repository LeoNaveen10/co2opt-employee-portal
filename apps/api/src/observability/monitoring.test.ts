import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { requestLogging } from './http';
import { browserEvents } from './browser-events';
import { errorHandler } from '../middleware/error-handler';
import { log } from './logger';

test('structured logging correlates requests and excludes sensitive input', async () => {
  const output: string[] = [];
  const original = process.stdout.write;
  const previousLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    if (typeof chunk === 'string' && chunk.startsWith('{')) { output.push(chunk); return true; }
    return original.call(process.stdout, chunk);
  }) as typeof process.stdout.write;
  const app = express();
  app.use(requestLogging);
  app.use(browserEvents);
  app.get('/items/:id', (_req, res) => { log('info', 'test.event', { password: 'SECRET', token: 'SECRET' }); res.sendStatus(200); });
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    const id = '9bd937db-5a1c-45f4-9bb8-d9564b02a741';
    const response = await fetch(`${base}/items/SECRET?token=SECRET`, { headers: { 'X-Request-ID': id, Authorization: 'SECRET' } });
    await response.text();
    assert.equal(response.headers.get('X-Request-ID'), id);
    const invalidId = await fetch(`${base}/missing/SECRET`, { headers: { 'X-Request-ID': 'SECRET' } });
    await invalidId.text();
    assert.match(invalidId.headers.get('X-Request-ID')!, /^[0-9a-f-]{36}$/);
    const accepted = await fetch(`${base}/monitoring/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'api.slow', status: 200, durationMs: 3500, password: 'SECRET', message: 'SECRET', requestId: id }) });
    await accepted.text();
    assert.equal(accepted.status, 204);
    const rejected = await fetch(`${base}/monitoring/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'SECRET' }) });
    await rejected.text();
    assert.equal(rejected.status, 400);
    const records = output.map(line => JSON.parse(line));
    assert.ok(records.some(record => record.event === 'test.event' && record.requestId === id));
    assert.ok(records.some(record => record.route === '/items/:id' && record.status === 200));
    assert.ok(records.some(record => record.eventType === 'api.slow' && record.requestId === id));
    assert.ok(!output.join('').includes('SECRET'));
  } finally {
    process.stdout.write = original;
    if (previousLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previousLevel;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
