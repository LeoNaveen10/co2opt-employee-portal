import { app } from './app';
import { port } from './config';
import { sequelize } from './models';
import { startTimeWorker } from './features/time-tracking/worker';

async function start() {
  await sequelize.authenticate();
  // Schema changes are explicit: run db:sync for legacy tables and db:migrate for Jira.
  if (process.env.JIRA_CLIENT_ID) startTimeWorker();
  app.listen(port, () => console.log(`CO2OPT API running on http://localhost:${port}`));
}

start().catch((error: unknown) => {
  console.error('Unable to start the CO2OPT API with PostgreSQL:', error);
  process.exitCode = 1;
});
