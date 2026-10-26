import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../database/connection';
export type Snapshot = { started: string; durationSeconds: number; description: string; remoteUpdated: string };
export class TimeEntry extends Model {
  declare id: string; declare userId: string; declare connectionId: string; declare cloudId: string;
  declare issueId: string; declare ticketKey: string; declare summary: string; declare worklogId: string | null;
  declare authorAccountId: string; declare confirmed: Snapshot | null; declare desired: Snapshot | null;
  declare state: string; declare version: number; declare deleted: boolean; declare error: string | null;
}
TimeEntry.init({
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  userId: { type: DataTypes.STRING, allowNull: false }, connectionId: { type: DataTypes.STRING, allowNull: false },
  cloudId: { type: DataTypes.STRING, allowNull: false }, issueId: { type: DataTypes.STRING, allowNull: false },
  ticketKey: { type: DataTypes.STRING, allowNull: false }, summary: { type: DataTypes.TEXT, allowNull: false },
  worklogId: { type: DataTypes.STRING, allowNull: false }, authorAccountId: { type: DataTypes.STRING, allowNull: false },
  confirmed: { type: DataTypes.JSONB, allowNull: false }, desired: DataTypes.JSONB,
  state: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' },
  version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, error: DataTypes.TEXT
}, { sequelize, tableName: 'time_entries', modelName: 'TimeEntry', indexes: [{ unique: true, fields: ['cloudId', 'worklogId'] }, { fields: ['userId', 'connectionId'] }] });
