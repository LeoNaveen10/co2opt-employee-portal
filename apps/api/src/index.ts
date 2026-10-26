import { app } from './app';
import { port } from './config';
import { sequelize } from './models';
import { startTimeWorker } from './features/time-tracking/worker';
import { log, errorMetadata } from './observability/logger';

process.on('uncaughtExceptionMonitor', error => {
  log('fatal', 'process.uncaught_exception', errorMetadata(error));
});
process.on('exit', code => {
  log(code === 0 ? 'info' : 'fatal', 'process.exited', { status: code });
});

async function start() {
  await sequelize.authenticate();
  // Schema changes are explicit: run db:sync for legacy tables and db:migrate for Jira.
  if (process.env.JIRA_CLIENT_ID) startTimeWorker();
  const server = app.listen(port, () => log('info', 'server.started', { port }));
  server.on('error', error => {
    log('fatal', 'server.failed', errorMetadata(error));
    process.exit(1);
  });
}

start().catch((error: unknown) => {
  log('fatal', 'server.start_failed', errorMetadata(error));
  process.exitCode = 1;
});
