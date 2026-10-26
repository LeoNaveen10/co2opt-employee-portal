import { Router } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { sequelize, TimeEntry, TimeSyncOperation, LeaveRequest, JiraConnection } from '../../models';
import { requireAuth } from '../auth/session';
import { csrf, run, connectionFor } from '../jira/routes';
import { JiraError, jira, issueSchema, jiraConfig, refreshCredentials, worklogSchema } from '../jira/client';
import { addDays, localDate, weekStart, parseDuration, startedAt, TIMEZONE, fromAdf } from './time';
const router = Router();
router.use('/time-tracking', requireAuth);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
const weekSchema = dateSchema.refine(value => weekStart(value) === value && value <= weekStart() && value >= '0001-01-01');
export function inRange(entry: TimeEntry, start: string, end: string) {
  return [entry.confirmed, entry.desired].some(value => value && localDate(value.started) >= start && localDate(value.started) <= end);
}
async function holidays(userId: string, start: string, end: string) {
  const leaves = await LeaveRequest.findAll({ where: { employeeId: userId, status: 'APPROVED', startDate: { [Op.lte]: end }, endDate: { [Op.gte]: start } } });
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) if (leaves.some(leave => date >= leave.startDate && date <= leave.endDate)) dates.push(date);
  return dates;
}
async function weekData(userId: string, start: string, details: boolean) {
  const end = addDays(start, 6);
  const holidayDates = await holidays(userId, start, end);
  const connections = await JiraConnection.findAll({ where: { userId } });
  const dateRange = (column: string) => sequelize.where(sequelize.literal(`((${column}->>'started')::timestamptz AT TIME ZONE 'Asia/Kolkata')::date`), { [Op.between]: [start, end] });
  const entries = await TimeEntry.findAll({ where: { userId, deleted: false, [Op.or]: [dateRange('confirmed'), dateRange('desired')] }, order: [['createdAt', 'ASC']] });
  const operations = await TimeSyncOperation.findAll({ where: { userId, action: 'create', status: ['pending', 'processing', 'paused', 'failed', 'reconcile'], [Op.and]: [dateRange('payload')] }, order: [['createdAt', 'ASC']] });
  const pendingCreations = operations.filter(op => op.payload && localDate(op.payload.started) >= start && localDate(op.payload.started) <= end).map(op => ({ id: op.id, ticketKey: op.payload!.ticket!.ticketKey, date: localDate(op.payload!.started), durationSeconds: op.payload!.durationSeconds, status: op.status, error: op.error }));
  const total = entries.reduce((sum, entry) => sum + (entry.confirmed && localDate(entry.confirmed.started) >= start && localDate(entry.confirmed.started) <= end ? entry.confirmed.durationSeconds : 0), 0);
  const trackedDates = [...new Set(entries.filter(entry => entry.confirmed && entry.confirmed.durationSeconds > 0 && localDate(entry.confirmed.started) >= start && localDate(entry.confirmed.started) <= end).map(entry => localDate(entry.confirmed!.started)))];
  return { start, end, trackedDates, totalSeconds: total, lastRefreshed: new Date().toISOString(), error: null, holidays: holidayDates, pendingCount: entries.filter(e => e.state !== 'synced').length + pendingCreations.length, pendingCreations, entries: details ? entries.map(entry => ({ id: entry.id, issueId: entry.issueId, ticketKey: entry.ticketKey, summary: entry.summary, ticketUrl: `${connections.find(c => c.id === entry.connectionId)?.siteUrl || ''}/browse/${encodeURIComponent(entry.ticketKey)}`, confirmed: entry.confirmed, desired: entry.desired, state: entry.state, version: entry.version, error: entry.error, worklogId: entry.worklogId })) : undefined };
}
router.get('/time-tracking/history', run(async (req, res) => {
  const { cursor } = z.object({ cursor: weekSchema.optional() }).parse(req.query);
  const start = cursor || weekStart();
  const weeks = [];
  for (let i = 0; i < 5; i++) weeks.push(await weekData(req.session.userId!, addDays(start, -7 * i), false));
  res.json({ timezone: TIMEZONE, weeks, cursor: addDays(start, -35) });
}));
router.get('/time-tracking/week/:start', run(async (req, res) => {
  const start = weekSchema.parse(req.params.start);
  res.json(await weekData(req.session.userId!, start, true));
}));
const entrySchema = z.object({ clientOperationId: z.string().uuid(), issueId: z.string().regex(/^\d+$/).optional(), date: dateSchema, duration: z.string().max(50), description: z.string().max(10000).default(''), version: z.number().int().positive().optional() }).strict();
function desiredValue(data: z.infer<typeof entrySchema>) {
  try { return { started: startedAt(data.date, '12:00'), durationSeconds: parseDuration(data.duration), description: data.description, remoteUpdated: '' }; }
  catch (error) { throw new JiraError(400, (error as Error).message); }
}
router.post('/time-tracking/entries', csrf, run(async (req, res) => {
  const data = entrySchema.parse(req.body), desired = desiredValue(data);
  if (!data.issueId) throw new JiraError(400, 'Choose a Jira ticket.');
  const connection = await connectionFor(req.session.userId!);
  await refreshCredentials(connection);
  const result = await sequelize.transaction(async transaction => {
    await connection.reload({ transaction, lock: transaction.LOCK.UPDATE });
    const duplicate = await TimeSyncOperation.findByPk(data.clientOperationId, { transaction });
    if (duplicate) {
      if (duplicate.userId !== req.session.userId || duplicate.action !== 'create') throw new JiraError(409, 'Operation ID already used.');
      return { operationId: duplicate.id };
    }
    const issue = issueSchema.parse(await jira(connection, `/issue/${encodeURIComponent(data.issueId!)}?fields=summary,project`, {}, transaction));
    if (jiraConfig.projects.length && !jiraConfig.projects.includes(issue.fields.project.key)) throw new JiraError(403, 'This project is outside the approved Jira scope.');
    // Only a durable delivery request exists before Jira succeeds. No time entry or total is saved yet.
    await TimeSyncOperation.create({ id: data.clientOperationId, userId: req.session.userId!, connectionId: connection.id, entryId: null, action: 'create', payload: { ...desired, ticket: { issueId: issue.id, ticketKey: issue.key, summary: issue.fields.summary } }, expectedVersion: 1 }, { transaction });
    return { operationId: data.clientOperationId };
  });
  res.status(202).json(result);
}));
async function enqueue(userId: string, id: string, action: string, data: { clientOperationId: string; version: number }, desired: ReturnType<typeof desiredValue> | null) {
  const initial = await TimeEntry.findOne({ where: { id, userId, deleted: false } });
  if (!initial) throw new JiraError(404, 'Time entry not found.');
  return sequelize.transaction(async transaction => {
    const connection = await JiraConnection.findByPk(initial.connectionId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!connection || connection.status !== 'connected') throw new JiraError(409, 'Reconnect Jira before changing worklogs.');
    const duplicate = await TimeSyncOperation.findByPk(data.clientOperationId, { transaction });
    if (duplicate) {
      if (duplicate.userId !== userId || duplicate.entryId !== id || duplicate.action !== action) throw new JiraError(409, 'Operation ID already used.');
      return { entryId: id };
    }
    const entry = await initial.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (entry.version !== data.version || entry.state !== 'synced' || !entry.worklogId) throw new JiraError(409, 'Refresh this entry or resolve its pending operation before editing.');
    await entry.update({ desired, state: action === 'delete' ? 'pending-delete' : 'pending', version: entry.version + 1 }, { transaction });
    await TimeSyncOperation.create({ id: data.clientOperationId, userId, connectionId: connection.id, entryId: id, action, payload: desired, expectedVersion: entry.version }, { transaction });
    return { entryId: id };
  });
}
router.put('/time-tracking/entries/:id', csrf, run(async (req, res) => {
  const data = entrySchema.extend({ version: z.number().int().positive() }).parse(req.body);
  if (data.issueId) throw new JiraError(400, 'The ticket cannot be changed.');
  res.status(202).json(await enqueue(req.session.userId!, String(req.params.id), 'update', data, desiredValue(data)));
}));
router.delete('/time-tracking/entries/:id', csrf, run(async (req, res) => {
  const data = z.object({ clientOperationId: z.string().uuid(), version: z.number().int().positive() }).strict().parse(req.body);
  res.status(202).json(await enqueue(req.session.userId!, String(req.params.id), 'delete', data, null));
}));
router.post('/time-tracking/entries/:id/:action', csrf, run(async (req, res) => {
  const action = z.enum(['retry', 'discard', 'reload']).parse(req.params.action);
  const initial = await TimeEntry.findOne({ where: { id: req.params.id, userId: req.session.userId!, deleted: false } });
  if (!initial) throw new JiraError(404, 'Time entry not found.');
  if (action === 'reload') {
    const connection = await JiraConnection.findByPk(initial.connectionId);
    if (!connection) throw new JiraError(409, 'Reconnect Jira first.');
    await refreshCredentials(connection);
  }
  await sequelize.transaction(async transaction => {
    const connection = await JiraConnection.findByPk(initial.connectionId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!connection || connection.status !== 'connected') throw new JiraError(409, 'Reconnect Jira first.');
    const entry = await initial.reload({ transaction, lock: transaction.LOCK.UPDATE });
    const operation = await TimeSyncOperation.findOne({ where: { entryId: entry.id, status: ['failed', 'paused', 'reconcile'] }, transaction, lock: transaction.LOCK.UPDATE, order: [['createdAt', 'DESC']] });
    if (!operation) throw new JiraError(409, 'This operation is still running or already completed.');
    if (action === 'reload') {
      const remote = worklogSchema.parse(await jira(connection, `/issue/${encodeURIComponent(entry.issueId)}/worklog/${encodeURIComponent(entry.worklogId!)}`, {}, transaction));
      if (remote.author.accountId !== connection.accountId) throw new JiraError(403, 'You can only load your own Jira worklogs.');
      await operation.update({ status: 'discarded' }, { transaction });
      await entry.update({ confirmed: { started: remote.started, durationSeconds: remote.timeSpentSeconds, description: fromAdf(remote.comment), remoteUpdated: remote.updated }, desired: null, state: 'synced', error: null, version: entry.version + 1 }, { transaction });
    } else if (action === 'discard') {
      if (operation.action === 'create' && operation.attempts > 0) throw new JiraError(409, 'An uncertain creation cannot be discarded safely. Retry reconciliation or ask an administrator to verify the operation marker in Jira.');
      await operation.update({ status: 'discarded' }, { transaction });
      await entry.update({ desired: null, state: 'synced', deleted: !entry.confirmed, error: null, version: entry.version + 1 }, { transaction });
    } else {
      await operation.update({ status: 'pending', nextAttempt: new Date(), error: null }, { transaction });
      await entry.update({ state: operation.action === 'delete' ? 'pending-delete' : 'pending', error: null }, { transaction });
    }
  });
  res.json({ ok: true });
}));
router.post('/time-tracking/operations/:id/retry', csrf, run(async (req, res) => {
  const operation = await TimeSyncOperation.findOne({ where: { id: req.params.id, userId: req.session.userId!, action: 'create' } });
  if (!operation) throw new JiraError(404, 'Delivery request not found.');
  await sequelize.transaction(async transaction => {
    const connection = await JiraConnection.findByPk(operation.connectionId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!connection || connection.status !== 'connected') throw new JiraError(409, 'Reconnect Jira first.');
    await operation.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (!['failed', 'reconcile', 'paused'].includes(operation.status)) throw new JiraError(409, 'This request is already running or completed.');
    await operation.update({ status: 'pending', nextAttempt: new Date(), error: null }, { transaction });
  });
  res.json({ ok: true });
}));
router.use((error: unknown, _req: any, res: any, _next: any) => {
  if (error instanceof JiraError) return res.status(error.status === 401 ? 409 : error.status).json({ message: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ message: 'Invalid time tracking request. Check the date, duration, and version.' });
  // Do not send or log upstream request bodies or work descriptions.
  res.status(503).json({ message: 'Time tracking is unavailable. Check database migrations and retry.' });
});
export default router;
