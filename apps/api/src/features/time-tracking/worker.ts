import { Op } from 'sequelize';
import { sequelize, JiraConnection, TimeEntry, TimeSyncOperation } from '../../models';
import { jira, JiraError, allWorklogs, worklogSchema, refreshCredentials } from '../jira/client';
import { toAdf, fromAdf } from './time';
export const MARKER = 'co2opt.operation';
export function matchesOperationMarker(value: unknown, operationId: string) {
  return value === operationId || (typeof value === 'object' && value !== null && 'operationId' in value && value.operationId === operationId);
}
export function retryDelay(attempt: number, retryAfter = 0) { return Math.max(retryAfter, Math.min(300000, 1000 * 2 ** Math.min(attempt, 9))); }
export function ambiguousCreate(error: unknown) { return !(error instanceof JiraError) || error.status >= 500; }
export async function processOperation(id: string) {
  const candidate = await TimeSyncOperation.findByPk(id);
  if (!candidate) return;
  const initialConnection = await JiraConnection.findByPk(candidate.connectionId);
  if (initialConnection?.status === 'connected') {
    try { await refreshCredentials(initialConnection); } catch { /* Recorded by the operation below. */ }
  }
  await sequelize.transaction(async transaction => {
    const connection = await JiraConnection.findByPk(candidate.connectionId, { transaction, lock: transaction.LOCK.UPDATE });
    const entry = candidate.entryId ? await TimeEntry.findByPk(candidate.entryId, { transaction, lock: transaction.LOCK.UPDATE }) : null;
    const operation = await TimeSyncOperation.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!connection || !operation || !['pending', 'processing'].includes(operation.status)) return;
    if (connection.status !== 'connected') {
      await operation.update({ status: 'paused', error: 'Reconnect Jira, then retry.' }, { transaction }); return;
    }
    if (operation.action !== 'create' && (!entry || entry.version !== operation.expectedVersion)) {
      await operation.update({ status: 'failed', error: 'Entry version changed. Reload before retrying.' }, { transaction }); return;
    }
    const ticket = operation.payload?.ticket;
    const issueId = entry?.issueId || ticket!.issueId;
    const root = `/issue/${encodeURIComponent(issueId)}/worklog`;
    try {
      let log;
      if (operation.action === 'create' && operation.reconcileRequired) {
        const matches = (await allWorklogs(connection, issueId, transaction)).filter(w => w.author.accountId === connection.accountId && w.properties?.some(p => p.key === MARKER && matchesOperationMarker(p.value, operation.id)));
        if (matches.length === 1) log = matches[0];
        else throw new JiraError(422, 'Creation outcome needs reconciliation. No additional worklog was created. Check Jira or contact an administrator.');
      }
      if (operation.action !== 'create') {
        const remote = worklogSchema.parse(await jira(connection, `${root}/${encodeURIComponent(entry!.worklogId!)}`, {}, transaction));
        if (remote.author.accountId !== connection.accountId) throw new JiraError(403, 'You can only change your own Jira worklogs.');
        if (remote.updated !== entry!.confirmed?.remoteUpdated) throw new JiraError(412, 'This worklog changed in Jira. Resolve the remote conflict before editing again.');
      }
      if (operation.action === 'delete') {
        await jira(connection, `${root}/${encodeURIComponent(entry!.worklogId!)}?adjustEstimate=leave`, { method: 'DELETE' }, transaction);
        await entry!.update({ deleted: true, state: 'synced', desired: null, error: null }, { transaction });
      } else {
        const payload = operation.payload!;
        if (!log) log = worklogSchema.parse(await jira(connection, `${root}${operation.action === 'update' ? `/${encodeURIComponent(entry!.worklogId!)}` : ''}?adjustEstimate=leave`, {
          method: operation.action === 'create' ? 'POST' : 'PUT',
          body: JSON.stringify({ started: payload.started, timeSpentSeconds: payload.durationSeconds, comment: toAdf(payload.description), ...(operation.action === 'create' ? { properties: [{ key: MARKER, value: { operationId: operation.id } }] } : {}) })
        }, transaction));
        if (log.author.accountId !== connection.accountId) throw new JiraError(403, 'Jira returned an unexpected worklog author.');
        const confirmed = { started: log.started, durationSeconds: log.timeSpentSeconds, description: fromAdf(log.comment), remoteUpdated: log.updated };
        if (operation.action === 'create') {
          // Insert the actual timesheet record ONLY AFTER Jira confirms success.
          const saved = await TimeEntry.create({ userId: operation.userId, connectionId: connection.id, cloudId: connection.cloudId, issueId, ticketKey: ticket!.ticketKey, summary: ticket!.summary, authorAccountId: log.author.accountId, worklogId: log.id, confirmed, desired: null, state: 'synced' }, { transaction });
          await operation.update({ entryId: saved.id }, { transaction });
        } else await entry!.update({ confirmed, desired: null, state: 'synced', error: null }, { transaction });
      }
      await operation.update({ status: 'done', error: null }, { transaction });
    } catch (error) {
      const upstream = error instanceof JiraError ? error : null;
      const uncertain = operation.action === 'create' && ambiguousCreate(error);
      const transient = !upstream || upstream.status === 429 || upstream.status >= 500;
      const retry = (uncertain || transient) && operation.attempts < 6;
      const message = upstream?.message || 'Jira did not confirm the request. No new timesheet entry has been saved.';
      await operation.update({ status: retry ? 'pending' : uncertain || upstream?.status === 422 ? 'reconcile' : 'failed', reconcileRequired: uncertain || upstream?.status === 422, error: message, nextAttempt: new Date(Date.now() + retryDelay(operation.attempts, upstream?.retryAfter)) }, { transaction });
      if (entry) await entry.update({ state: retry ? 'pending' : 'failed', error: message }, { transaction });
      if (upstream?.status === 401 || (upstream?.status === 409 && /reconnect/i.test(message))) await connection.update({ status: 'reconnect' }, { transaction });
    }
  });
}
let running = false;
export async function workerTick() {
  if (running) return;
  running = true;
  try {
    await sequelize.transaction(async election => {
      const [rows] = await sequelize.query('SELECT pg_try_advisory_xact_lock(724219) AS locked', { transaction: election });
      if (!(rows[0] as { locked: boolean }).locked) return;
      const operations = await TimeSyncOperation.findAll({ where: { status: ['pending', 'processing'], nextAttempt: { [Op.lte]: new Date() } }, order: [['createdAt', 'ASC']], limit: 10 });
      for (const operation of operations) {
        // Persist BEFORE the HTTP call so crashes require reconciliation.
        await operation.update({ status: 'processing', reconcileRequired: operation.reconcileRequired || operation.status === 'processing', attempts: operation.attempts + 1 });
        await processOperation(operation.id);
      }
    });
  } finally { running = false; }
}
export function startTimeWorker() {
  const tick = () => void workerTick().catch(() => console.error('Time sync worker could not complete its database cycle.'));
  tick(); const timer = setInterval(tick, 5000); timer.unref();
}
