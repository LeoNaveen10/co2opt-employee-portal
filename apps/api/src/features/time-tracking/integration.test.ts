import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Sequelize } from 'sequelize';
import type { AddressInfo } from 'node:net';

test('Jira-first persistence, local-only reads, ownership, queue recovery and holiday dates', { skip: process.env.TIME_TRACKING_DB_TESTS !== '1' }, async () => {
  const schema = `time_test_${randomBytes(8).toString('hex')}`;
  const admin = new Sequelize(process.env.DATABASE_URL!, { logging: false });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const oldOptions = process.env.PGOPTIONS;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  process.env.DB_SCHEMA = schema;
  process.env.JIRA_CLIENT_ID = 'test-client'; process.env.JIRA_CLIENT_SECRET = 'test-secret';
  process.env.JIRA_SITE_URL = 'https://test.atlassian.net';
  process.env.JIRA_PROJECT_KEYS = 'test';
  process.env.JIRA_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  const nativeFetch = globalThis.fetch;
  let server: ReturnType<(typeof import('../../app'))['app']['listen']> | undefined;
  let db: Sequelize | undefined;
  try {
    const { sequelize, User, LeaveRequest, JiraConnection, TimeEntry, TimeSyncOperation } = await import('../../models');
    db = sequelize;
    await User.sync(); await LeaveRequest.sync();
    for (let i = 0; i < 2; i++) {
      const migration = spawnSync(process.execPath, ['--import', 'tsx', 'src/database/migrate.ts'], { env: { ...process.env }, encoding: 'utf8' });
      assert.equal(migration.status, 0, migration.stderr);
    }
    const { employeeEmails } = await import('../../config');
    employeeEmails.add('timesheet-test@example.com');
    const { encrypt, decrypt } = await import('../jira/client');
    const encrypted = encrypt({ access_token: 'access', refresh_token: 'refresh' });
    assert.equal(decrypt(encrypted).refresh_token, 'refresh');
    const corrupt = Buffer.from(encrypted, 'base64'); corrupt[20] ^= 1;
    assert.throws(() => decrypt(corrupt.toString('base64')));
    const { app } = await import('../../app');
    server = app.listen(0);
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    let cookie = '', csrf = '', jiraCalls = 0, creates = 0, mode = 'ok', refreshCalls = 0;
    const issue = { id: '100', key: 'TEST-1', fields: { summary: 'Test task', project: { key: 'TEST', name: 'Test' } } };
    const logs = new Map<string, any>();
    globalThis.fetch = (async (input: any, options?: RequestInit) => {
      const url = String(input);
      if (url === 'https://auth.atlassian.com/oauth/token') { refreshCalls++; return Response.json({ access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 3600 }); }
      if (!url.startsWith('https://api.atlassian.com/')) return nativeFetch(input, options);
      jiraCalls++;
      const parsed = new URL(url), method = options?.method || 'GET';
      if (parsed.pathname.endsWith('/search/jql')) return Response.json({ issues: [issue] });
      if (parsed.pathname.endsWith('/issue/100') || parsed.pathname.endsWith('/issue/TEST-1')) return Response.json(issue);
      if (parsed.pathname.endsWith('/issue/TEST-999')) return Response.json({}, { status: 404 });
      if (parsed.pathname.endsWith('/issue/TEST-400')) return Response.json({ errorMessages: ['The worklog property must be a JSON object.'] }, { status: 400 });
      if (parsed.pathname.endsWith('/worklog') && method === 'POST') {
        creates++;
        if (mode === 'denied') return Response.json({}, { status: 403 });
        const payload = JSON.parse(String(options!.body));
        assert.equal(payload.properties[0].key, 'co2opt.operation');
        assert.equal(typeof payload.properties[0].value, 'object', 'Jira rejects primitive property values');
        assert.equal(typeof payload.properties[0].value.operationId, 'string', 'Jira worklog property must be a JSON object with the operation ID');
        assert.equal(parsed.searchParams.get('adjustEstimate'), 'leave');
        assert.equal(await TimeEntry.count(), 0, 'No timesheet row exists when Jira is first called');
        const log = { ...payload, id: String(creates), author: { accountId: 'employee' }, updated: '2026-10-25T10:00:00.000+0000' };
        logs.set(log.id, log);
        if (mode === 'timeout') throw new TypeError('Simulated lost response');
        return Response.json(log, { status: 201 });
      }
      if (parsed.pathname.endsWith('/worklog') && method === 'GET') {
        // Force marker recovery through multiple pages, including another employee's worklog.
        const all = [{ id: 'other-remote', author: { accountId: 'someone-else' }, started: dateForOther(), timeSpentSeconds: 60, updated: '2026-10-25T10:00:00.000+0000' }, ...logs.values()];
        const offset = Number(parsed.searchParams.get('startAt'));
        return Response.json({ startAt: offset, total: all.length, worklogs: all.slice(offset, offset + 1) });
      }
      const id = parsed.pathname.split('/').pop()!;
      if (method === 'GET' && logs.has(id)) return Response.json(logs.get(id));
      if (method === 'PUT') {
        assert.equal(parsed.searchParams.get('adjustEstimate'), 'leave');
        const log = { ...logs.get(id), ...JSON.parse(String(options!.body)), updated: '2026-10-25T11:00:00.000+0000' }; logs.set(id, log); return Response.json(log);
      }
      if (method === 'DELETE') { assert.equal(parsed.searchParams.get('adjustEstimate'), 'leave'); logs.delete(id); return new Response(null, { status: 204 }); }
      throw new Error('Unexpected mocked Jira request');
    }) as typeof fetch;
    function dateForOther() { return '2026-01-01T12:00:00.000+0530'; }
    async function request(path: string, method = 'GET', body?: object, token = csrf) {
      const response = await nativeFetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(token ? { 'X-Time-CSRF': token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
      return { status: response.status, data: await response.json() };
    }
    assert.equal((await request('/time-tracking/history')).status, 401);
    const signup = await request('/auth/signup', 'POST', { email: 'timesheet-test@example.com', name: 'Test employee', role: 'EMPLOYEE', password: 'test-only-password' });
    assert.equal(signup.status, 200);
    const userId = signup.data.user.id;
    csrf = (await request('/jira/status')).data.csrf;
    await JiraConnection.create({ userId, cloudId: 'test-cloud', siteUrl: process.env.JIRA_SITE_URL, accountId: 'employee', displayName: 'Employee', credentials: encrypted, expiresAt: new Date(Date.now() + 3600000), status: 'connected' });
    const { weekStart, localDate } = await import('./time');
    const today = localDate(), start = weekStart();
    await LeaveRequest.create({ employeeId: userId, startDate: today, endDate: today, days: 1, status: 'APPROVED' });
    const history = await request('/time-tracking/history');
    assert.equal(history.data.weeks.length, 5); assert.equal(history.data.weeks[0].totalSeconds, 0);
    assert.deepEqual(history.data.weeks[0].trackedDates, []);
    assert.ok(history.data.weeks[0].holidays.includes(today)); assert.equal(jiraCalls, 0, 'History must never call Jira');
    const oldHistory = await request(`/time-tracking/history?cursor=${history.data.cursor}`);
    assert.equal(new Set([...history.data.weeks, ...oldHistory.data.weeks].map(w => w.start)).size, 10);
    assert.equal((await request('/jira/callback?code=bad&state=bad')).status, 400);
    const payload = { clientOperationId: randomUUID(), issueId: '100', date: today, duration: '1h 30m', description: 'Test work' };
    assert.equal((await request('/time-tracking/entries', 'POST', payload, 'wrong')).status, 403);
    mode = 'denied';
    assert.equal((await request('/time-tracking/entries', 'POST', payload)).status, 202);
    assert.equal(await TimeEntry.count(), 0);
    const { workerTick } = await import('./worker');
    await workerTick(); assert.equal(await TimeEntry.count(), 0, 'Rejected Jira create must not create a time entry');
    assert.equal((await TimeSyncOperation.findByPk(payload.clientOperationId))!.status, 'failed');
    mode = 'timeout';
    assert.equal((await request(`/time-tracking/operations/${payload.clientOperationId}/retry`, 'POST', {})).status, 200);
    await workerTick(); assert.equal(await TimeEntry.count(), 0, 'Unconfirmed Jira response must not create a time entry');
    const operation = (await TimeSyncOperation.findByPk(payload.clientOperationId))!;
    await operation.update({ nextAttempt: new Date(0) }); mode = 'ok';
    await workerTick();
    assert.equal(await TimeEntry.count(), 1, 'Marker reconciliation persists Jira success');
    assert.equal(creates, 2, 'No duplicate post after ambiguous success');
    assert.equal((await request('/time-tracking/entries', 'POST', payload)).status, 202);
    assert.equal(await TimeEntry.count(), 1);
    const beforeRead = jiraCalls;
    const week = await request(`/time-tracking/week/${start}?refresh=1`);
    assert.equal(week.data.totalSeconds, 5400); assert.equal(jiraCalls, beforeRead, 'Week refresh is local-only');
    assert.deepEqual(week.data.trackedDates, [today]);
    assert.deepEqual((await request('/time-tracking/history')).data.weeks[0].trackedDates, [today], 'Collapsed weeks must include tracked-day indicators');
    const entry = week.data.entries[0];
    const other = await User.create({ name: 'Other', email: 'other@example.com', role: 'EMPLOYEE' });
    const otherEntry = await TimeEntry.create({ userId: other.id, connectionId: (await JiraConnection.findOne())!.id, cloudId: 'test-cloud', issueId: '100', ticketKey: 'TEST-1', summary: 'Other private entry', authorAccountId: 'other', worklogId: 'private', confirmed: entry.confirmed, state: 'synced' });
    assert.equal((await request(`/time-tracking/entries/${otherEntry.id}`, 'DELETE', { clientOperationId: randomUUID(), version: 1 })).status, 404);
    const update = { clientOperationId: randomUUID(), date: today, duration: '2h', description: 'Edited', version: entry.version };
    assert.equal((await request(`/time-tracking/entries/${entry.id}`, 'PUT', update)).status, 202);
    assert.equal((await request(`/time-tracking/week/${start}`)).data.totalSeconds, 5400, 'Pending edits do not change saved totals');
    await workerTick();
    const edited = (await request(`/time-tracking/week/${start}`)).data;
    assert.equal(edited.totalSeconds, 7200); assert.equal(edited.entries.length, 1);
    const remote = [...logs.values()][0];
    remote.updated = '2026-10-25T12:00:00.000+0000'; remote.timeSpentSeconds = 10800;
    assert.equal((await request(`/time-tracking/entries/${entry.id}`, 'PUT', { ...update, clientOperationId: randomUUID(), version: edited.entries[0].version, duration: '4h' })).status, 202);
    await workerTick();
    assert.equal((await request(`/time-tracking/week/${start}`)).data.totalSeconds, 7200, 'Remote conflicts must preserve saved totals');
    assert.equal((await request(`/time-tracking/entries/${entry.id}/reload`, 'POST', {})).status, 200);
    const reloaded = (await request(`/time-tracking/week/${start}`)).data;
    assert.equal(reloaded.totalSeconds, 10800);
    const connection = (await JiraConnection.findOne())!;
    await connection.update({ expiresAt: new Date(0) });
    await request('/time-tracking/history'); assert.equal(refreshCalls, 0, 'Local reads never refresh Jira tokens');
    assert.equal((await request('/jira/tickets?q=TEST-1')).status, 200);
    await connection.reload(); assert.equal(refreshCalls, 1); assert.equal(decrypt(connection.credentials!).refresh_token, 'rotated-refresh');
    for (const query of ['test-1', '1', 'https://test.atlassian.net/browse/TEST-1']) {
      const result = await request(`/jira/tickets?q=${encodeURIComponent(query)}`);
      assert.equal(result.status, 200); assert.equal(result.data.tickets[0].key, 'TEST-1');
    }
    assert.equal((await request('/jira/tickets?q=OTHER-1')).status, 403, 'Exact lookup must preserve approved-project restrictions');
    const missing = await request('/jira/tickets?q=TEST-999');
    assert.equal(missing.status, 200); assert.equal(missing.data.tickets.length, 0); assert.match(missing.data.message, /permissions/);
    const invalid = await request('/jira/tickets?q=TEST-400');
    assert.equal(invalid.status, 400); assert.match(invalid.data.message, /property must be a JSON object/, 'Actionable Jira validation errors must reach the employee');
    assert.equal((await request(`/time-tracking/entries/${entry.id}`, 'DELETE', { clientOperationId: randomUUID(), version: reloaded.entries[0].version })).status, 202);
    assert.equal((await request(`/time-tracking/week/${start}`)).data.totalSeconds, 10800);
    await workerTick(); assert.equal((await request(`/time-tracking/week/${start}`)).data.totalSeconds, 0);
    assert.equal(logs.size, 0);
  } finally {
    globalThis.fetch = nativeFetch;
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    if (db) await db.close();
    if (oldOptions === undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS = oldOptions;
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.close();
  }
});
