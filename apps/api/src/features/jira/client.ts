import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { z } from 'zod';
import { JiraConnection, sequelize } from '../../models';

export class JiraError extends Error {
  constructor(public status: number, message: string, public retryAfter = 0) { super(message); }
}
export const jiraConfig = {
  clientId: process.env.JIRA_CLIENT_ID || '', clientSecret: process.env.JIRA_CLIENT_SECRET || '',
  callback: process.env.JIRA_CALLBACK_URL || 'http://localhost:4000/jira/callback',
  site: (process.env.JIRA_SITE_URL || '').replace(/\/$/, ''),
  projects: [...new Set((process.env.JIRA_PROJECT_KEYS || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean))]
};
function key() {
  const result = Buffer.from(process.env.JIRA_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (result.length !== 32) throw new JiraError(503, 'Jira requires a stable 32-byte token encryption key.');
  return result;
}
export function configured() {
  try { key(); return !!(jiraConfig.clientId && jiraConfig.clientSecret && /^https:\/\/[a-z0-9-]+\.atlassian\.net$/i.test(jiraConfig.site)); } catch { return false; }
}
export function encrypt(value: unknown) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  return Buffer.concat([iv, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString('base64');
}
export function decrypt(value: string): { access_token: string; refresh_token: string } {
  const bytes = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(-16));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString());
}
const tokenSchema = z.object({ access_token: z.string(), refresh_token: z.string(), expires_in: z.number().positive() });
export async function exchange(body: object) {
  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ client_id: jiraConfig.clientId, client_secret: jiraConfig.clientSecret, ...body })
  });
  if (!response.ok) throw new JiraError(response.status, 'Jira authorization failed. Reconnect Jira.');
  return tokenSchema.parse(await response.json());
}
export async function authorizedJson(url: string, accessToken: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new JiraError(response.status, 'Unable to verify the authorized Jira account.');
  return response.json();
}
export async function jira<T = any>(connection: JiraConnection, path: string, options: RequestInit = {}, transaction?: Transaction): Promise<T> {
  if (!transaction) {
    await refreshCredentials(connection);
    return sequelize.transaction(async t => {
      const locked = await JiraConnection.findByPk(connection.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!locked) throw new JiraError(409, 'Connect Jira first.');
      return jira<T>(locked, path, options, t);
    });
  }
  if (connection.status !== 'connected' || !connection.credentials) throw new JiraError(409, 'Reconnect Jira to continue. Pending work is preserved.');
  const tokens = decrypt(connection.credentials);
  if (connection.expiresAt.getTime() < Date.now()) throw new JiraError(503, 'Jira credentials need refreshing. Retry shortly.');
  const response = await fetch(`https://api.atlassian.com/ex/jira/${encodeURIComponent(connection.cloudId)}/rest/api/3${path}`, {
    ...options, headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    const delay = response.headers.get('retry-after');
    const retryAfter = delay ? (Number.isFinite(Number(delay)) ? Number(delay) * 1000 : Math.max(0, Date.parse(delay) - Date.now())) : 0;
    let message = response.status === 401 ? 'Reconnect Jira to restore access.' : response.status === 403 ? 'Jira denied access. Check ticket and own-worklog permissions.' : response.status === 404 ? 'The Jira record is unavailable; it may be inaccessible or deleted.' : response.status === 429 ? 'Jira is rate limiting requests. Synchronization will retry.' : `Jira could not complete the request (HTTP ${response.status}).`;
    if (response.status === 400) {
      const body = await response.json().catch(() => null);
      const details: string[] = [];
      if (Array.isArray(body?.errorMessages)) details.push(...body.errorMessages.filter((item: unknown): item is string => typeof item === 'string'));
      if (body?.errors && typeof body.errors === 'object' && !Array.isArray(body.errors)) {
        for (const [field, detail] of Object.entries(body.errors)) if (typeof detail === 'string') details.push(`${field}: ${detail}`);
      }
      if (details.length) message = `Jira rejected the request: ${details.slice(0, 3).join(' ').slice(0, 600)}`;
    }
    throw new JiraError(response.status, message, retryAfter);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
// Commit rotated credentials independently before a worklog transaction starts.
// A later Jira error must never roll back a successful refresh-token rotation.
export async function refreshCredentials(connection: JiraConnection) {
  const failure = await sequelize.transaction(async transaction => {
    await connection.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (connection.status !== 'connected' || !connection.credentials) return new JiraError(409, 'Reconnect Jira to continue.');
    if (connection.expiresAt.getTime() >= Date.now() + 60000) return null;
    const tokens = decrypt(connection.credentials);
    try {
      const fresh = await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
      await connection.update({ credentials: encrypt(fresh), expiresAt: new Date(Date.now() + fresh.expires_in * 1000) }, { transaction });
    } catch (error) {
      if (error instanceof JiraError && [400, 401].includes(error.status)) {
        await connection.update({ status: 'reconnect' }, { transaction });
        return new JiraError(409, 'Jira authorization expired. Reconnect Jira.');
      }
      throw error;
    }
    return null;
  });
  if (failure) throw failure;
}
export function quoteJql(value: string) { return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`; }
export function projectClause() { return jiraConfig.projects.length ? ` AND project in (${jiraConfig.projects.map(quoteJql).join(',')})` : ''; }
export const issueSchema = z.object({ id: z.string(), key: z.string(), fields: z.object({ summary: z.string(), project: z.object({ key: z.string(), name: z.string() }) }) });
export const worklogSchema = z.object({ id: z.string(), author: z.object({ accountId: z.string() }), started: z.string(), timeSpentSeconds: z.number().int().nonnegative(), updated: z.string(), comment: z.unknown().optional(), properties: z.array(z.object({ key: z.string(), value: z.unknown() })).optional() });
export type Worklog = z.infer<typeof worklogSchema>;
export async function allWorklogs(connection: JiraConnection, issueId: string, transaction?: Transaction) {
  const logs: Worklog[] = [];
  for (let startAt = 0; ; ) {
    const page = z.object({ worklogs: z.array(worklogSchema), total: z.number(), startAt: z.number() }).parse(await jira(connection, `/issue/${encodeURIComponent(issueId)}/worklog?startAt=${startAt}&maxResults=100&expand=properties`, {}, transaction));
    logs.push(...page.worklogs);
    startAt += page.worklogs.length;
    if (startAt >= page.total) return logs;
    if (!page.worklogs.length) throw new JiraError(502, 'Incomplete Jira worklog page. Retry refresh.');
  }
}
export async function deletionConfirmed(connection: JiraConnection, worklogId: string, since: string, transaction: Transaction) {
  let cursor = Math.max(0, Date.parse(since) || 0);
  // Bound each reconciliation. Unresolved records remain visibly inaccessible.
  for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
    const page = z.object({ lastPage: z.boolean(), until: z.number(), values: z.array(z.object({ worklogId: z.union([z.number(), z.string()]) })) }).parse(await jira(connection, `/worklog/deleted?since=${cursor}`, {}, transaction));
    if (page.values.some(value => String(value.worklogId) === worklogId)) return true;
    if (page.lastPage || page.until <= cursor) return false;
    cursor = page.until;
  }
  return false;
}
