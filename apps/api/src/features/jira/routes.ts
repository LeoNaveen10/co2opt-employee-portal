import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { JiraConnection, TimeSyncOperation, TimeEntry, sequelize } from '../../models';
import { requireAuth } from '../auth/session';
import { allowedWebOrigins, webOrigin } from '../../config';
import { configured, jiraConfig, exchange, encrypt, authorizedJson, jira, issueSchema, quoteJql, projectClause, JiraError, refreshCredentials } from './client';
import { parseTicketQuery } from './search-input';

declare module 'express-session' {
  interface SessionData { jiraState?: { value: string; expires: number }; timeCsrf?: string }
}
export const run = (handler: RequestHandler): RequestHandler => (req, res, next) => { Promise.resolve(handler(req, res, next)).catch(next); };
export const csrf: RequestHandler = (req, res, next) => {
  const token = req.get('X-Time-CSRF') || '', expected = req.session.timeCsrf || '';
  if (!expected || !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(expected)) || (req.get('Origin') && !allowedWebOrigins.has(req.get('Origin')!))) {
    res.status(403).json({ message: 'Reload time tracking before making changes.' }); return;
  }
  next();
};
export async function connectionFor(userId: string) {
  const connection = await JiraConnection.findOne({ where: { userId, siteUrl: jiraConfig.site } });
  if (!connection) throw new JiraError(409, 'Connect Jira to continue.');
  return connection;
}
const router = Router();
router.use('/jira', requireAuth);
router.get('/jira/status', run(async (req, res) => {
  req.session.timeCsrf ||= randomBytes(32).toString('hex');
  const connection = configured() ? await JiraConnection.findOne({ where: { userId: req.session.userId!, siteUrl: jiraConfig.site } }) : null;
  res.json({ configured: configured(), csrf: req.session.timeCsrf, connection: connection ? { status: connection.status, displayName: connection.displayName, siteUrl: connection.siteUrl } : null });
}));
router.post('/jira/connect', csrf, run(async (req, res) => {
  if (!configured()) throw new JiraError(503, 'An administrator must configure the approved Jira site and OAuth credentials.');
  const state = randomBytes(32).toString('hex');
  req.session.jiraState = { value: state, expires: Date.now() + 10 * 60000 };
  const query = new URLSearchParams({ audience: 'api.atlassian.com', client_id: jiraConfig.clientId, scope: 'read:jira-user read:jira-work write:jira-work offline_access', redirect_uri: jiraConfig.callback, state, response_type: 'code', prompt: 'consent' });
  res.json({ url: `https://auth.atlassian.com/authorize?${query}` });
}));
router.get('/jira/callback', run(async (req, res) => {
  const state = req.session.jiraState;
  delete req.session.jiraState;
  if (!state || state.expires < Date.now() || typeof req.query.state !== 'string' || req.query.state !== state.value) throw new JiraError(400, 'Jira authorization state is invalid or expired. Try connecting again.');
  if (typeof req.query.code !== 'string') throw new JiraError(400, 'Jira authorization was cancelled.');
  const tokens = await exchange({ grant_type: 'authorization_code', code: req.query.code, redirect_uri: jiraConfig.callback });
  const sites = z.array(z.object({ id: z.string(), url: z.string(), scopes: z.array(z.string()) })).parse(await authorizedJson('https://api.atlassian.com/oauth/token/accessible-resources', tokens.access_token));
  const site = sites.find(s => s.url.replace(/\/$/, '') === jiraConfig.site && ['read:jira-work', 'write:jira-work', 'read:jira-user'].every(scope => s.scopes.includes(scope)));
  if (!site) throw new JiraError(403, 'Authorize the approved organization Jira site with all requested permissions.');
  const me = z.object({ accountId: z.string(), displayName: z.string() }).parse(await authorizedJson(`https://api.atlassian.com/ex/jira/${encodeURIComponent(site.id)}/rest/api/3/myself`, tokens.access_token));
  await sequelize.transaction(async transaction => {
    const previous = await JiraConnection.findOne({ where: { userId: req.session.userId!, cloudId: site.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (previous && previous.accountId !== me.accountId) throw new JiraError(409, 'Reconnect the original Jira account to preserve worklog ownership.');
    const values = { userId: req.session.userId!, cloudId: site.id, siteUrl: jiraConfig.site, accountId: me.accountId, displayName: me.displayName, credentials: encrypt(tokens), expiresAt: new Date(Date.now() + tokens.expires_in * 1000), status: 'connected' };
    if (previous) await previous.update(values, { transaction }); else await JiraConnection.create(values, { transaction });
  });
  res.redirect(`${webOrigin}/?tab=time`);
}));
router.post('/jira/disconnect', csrf, run(async (req, res) => {
  await sequelize.transaction(async transaction => {
    const connection = await connectionFor(req.session.userId!);
    await connection.reload({ transaction, lock: transaction.LOCK.UPDATE });
    await connection.update({ credentials: null, status: 'disconnected' }, { transaction });
    await TimeSyncOperation.update({ status: 'paused', error: 'Disconnected. Reconnect, then retry this operation.' }, { where: { connectionId: connection.id, status: ['pending', 'processing'] }, transaction });
  });
  res.json({ ok: true });
}));
router.get('/jira/tickets', run(async (req, res) => {
  const { q, cursor } = z.object({ q: z.string().trim().min(1).max(500), cursor: z.string().max(4096).optional() }).parse(req.query);
  const connection = await connectionFor(req.session.userId!);
  const query = parseTicketQuery(q);
  const toTicket = (issue: z.infer<typeof issueSchema>) => ({ id: issue.id, key: issue.key, summary: issue.fields.summary, project: issue.fields.project.name });
  if (query.type === 'key' || query.type === 'number') {
    if (query.type === 'number' && !jiraConfig.projects.length) throw new JiraError(400, 'Enter the full ticket key, such as TM-6456. A number alone needs a configured project.');
    const keys = query.type === 'key' ? [query.value] : jiraConfig.projects.map(project => `${project}-${query.value}`);
    const tickets = [];
    for (const key of keys) {
      // Resolve exact keys directly instead of depending on the issue search index.
      const project = key.slice(0, key.lastIndexOf('-'));
      if (jiraConfig.projects.length && !jiraConfig.projects.includes(project)) throw new JiraError(403, `Project ${project} is not enabled for time tracking. Allowed projects: ${jiraConfig.projects.join(', ')}.`);
      try {
        const issue = issueSchema.parse(await jira(connection, `/issue/${encodeURIComponent(key)}?fields=summary,project`));
        // Jira may redirect an old key to a ticket moved into a different project.
        if (jiraConfig.projects.length && !jiraConfig.projects.includes(issue.fields.project.key.toUpperCase())) throw new JiraError(403, 'This ticket belongs to a project that is not enabled for time tracking.');
        tickets.push(toTicket(issue));
      } catch (error) {
        if (!(error instanceof JiraError) || error.status !== 404) throw error;
      }
    }
    res.json({ tickets, cursor: null, message: tickets.length ? null : 'Ticket not found or not accessible to your connected Jira account. Check its key and Jira permissions.' }); return;
  }
  if (!query.value) { res.json({ tickets: [], cursor: null }); return; }
  if (query.value.length > 100) throw new JiraError(400, 'Keep ticket title searches under 100 characters.');
  const clause = `summary ~ ${quoteJql(query.value + '*')}`;
  const page = z.object({ issues: z.array(issueSchema), nextPageToken: z.string().optional() }).parse(await jira(connection, '/search/jql', { method: 'POST', body: JSON.stringify({ jql: `(${clause})${projectClause()} ORDER BY updated DESC`, fields: ['summary', 'project'], maxResults: 20, ...(cursor ? { nextPageToken: cursor } : {}) }) }));
  res.json({ tickets: page.issues.map(toTicket), cursor: page.nextPageToken || null, message: jiraConfig.projects.length ? `Searching projects: ${jiraConfig.projects.join(', ')}. Check Jira permissions if a ticket is missing.` : 'Only tickets accessible to your connected Jira account are shown.' });
}));
router.use((error: unknown, _req: any, res: any, _next: any) => {
  if (error instanceof JiraError) return res.status(error.status === 401 ? 409 : error.status).json({ message: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ message: 'Invalid Jira request or response. Reload and try again.' });
  res.status(503).json({ message: 'Jira connection is unavailable. Check server configuration and retry.' });
});
export default router;
