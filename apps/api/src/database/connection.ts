import 'dotenv/config';
import { Sequelize } from 'sequelize';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL must point to the local PostgreSQL database.');
}

export const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  define: { schema: process.env.DB_SCHEMA || 'public' },
  logging: false
});
