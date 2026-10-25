import { sequelize } from './models';

try {
  await sequelize.authenticate();
  await sequelize.sync();
  console.log('PostgreSQL schema synchronized');
} finally {
  await sequelize.close();
}
