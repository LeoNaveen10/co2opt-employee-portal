import { sequelize } from './models';

try {
  await sequelize.authenticate();
  for (const model of Object.values(sequelize.models)) {
    if (!['JiraConnection', 'TimeEntry', 'TimeSyncOperation'].includes(model.name)) await model.sync();
  }
  console.log('PostgreSQL schema synchronized');
} finally {
  await sequelize.close();
}
