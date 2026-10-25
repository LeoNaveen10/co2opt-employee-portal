import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../database/connection';

export class LeaveRequest extends Model {
  declare id: string;
  declare employeeId: string;
  declare reviewerId: string | null;
  declare startDate: string;
  declare endDate: string;
  declare days: number;
  declare status: string;
  declare note: string | null;
  declare createdAt: Date;
}

LeaveRequest.init({
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  employeeId: { type: DataTypes.STRING, allowNull: false },
  reviewerId: { type: DataTypes.STRING, allowNull: true },
  startDate: { type: DataTypes.STRING, allowNull: false },
  endDate: { type: DataTypes.STRING, allowNull: false },
  days: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'APPROVED' },
  note: { type: DataTypes.STRING(280), allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, { sequelize, modelName: 'LeaveRequest', tableName: 'leave_requests' });
