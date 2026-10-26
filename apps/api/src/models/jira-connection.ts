import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../database/connection';
export class JiraConnection extends Model {
  declare id: string; declare userId: string; declare cloudId: string; declare siteUrl: string;
  declare accountId: string; declare displayName: string; declare credentials: string | null;
  declare expiresAt: Date; declare status: string;
}
JiraConnection.init({
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  userId: { type: DataTypes.STRING, allowNull: false },
  cloudId: { type: DataTypes.STRING, allowNull: false },
  siteUrl: { type: DataTypes.STRING, allowNull: false },
  accountId: { type: DataTypes.STRING, allowNull: false },
  displayName: { type: DataTypes.STRING, allowNull: false },
  credentials: DataTypes.TEXT,
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false }
}, { sequelize, tableName: 'jira_connections', modelName: 'JiraConnection', indexes: [{ unique: true, fields: ['userId', 'cloudId'] }, { unique: true, fields: ['cloudId', 'accountId'] }] });
