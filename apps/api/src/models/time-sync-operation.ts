import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../database/connection';
import type { Snapshot } from './time-entry';
export class TimeSyncOperation extends Model {
  declare id: string; declare userId: string; declare entryId: string | null; declare connectionId: string; declare action: string;
  declare payload: (Snapshot & { ticket?: { issueId: string; ticketKey: string; summary: string } }) | null; declare expectedVersion: number; declare status: string;
  declare attempts: number; declare nextAttempt: Date; declare error: string | null;
  declare reconcileRequired: boolean;
}
TimeSyncOperation.init({
  id: { type: DataTypes.STRING, primaryKey: true }, userId: { type: DataTypes.STRING, allowNull: false },
  entryId: { type: DataTypes.STRING, allowNull: true }, connectionId: { type: DataTypes.STRING, allowNull: false }, action: { type: DataTypes.STRING, allowNull: false },
  payload: DataTypes.JSONB, expectedVersion: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  reconcileRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  nextAttempt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, error: DataTypes.TEXT
}, { sequelize, tableName: 'time_sync_operations', modelName: 'TimeSyncOperation', indexes: [{ fields: ['status', 'nextAttempt'] }] });
