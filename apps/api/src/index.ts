import { app } from './app';
import { port } from './config';
import { sequelize } from './models';

async function start() {
  await sequelize.authenticate();
  await sequelize.sync();
  app.listen(port, () => console.log(`CO2OPT API running on http://localhost:${port}`));
}

start().catch((error: unknown) => {
  console.error('Unable to start the CO2OPT API with PostgreSQL:', error);
  process.exitCode = 1;
});
