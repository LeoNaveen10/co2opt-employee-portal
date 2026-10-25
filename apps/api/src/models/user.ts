import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../database/connection';
import type { LeaveRequest } from './leave-request';

export class User extends Model {
  declare id: string;
  declare email: string;
  declare name: string;
  declare role: string;
  declare passwordHash: string | null;
  declare active: boolean;
  declare birthday: string | null;
  declare joinedOn: string | null;
  declare showBirthday: boolean;
  declare createdAt: Date;
  declare requestedLeaves?: LeaveRequest[];
}

User.init({
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'EMPLOYEE' },
  passwordHash: { type: DataTypes.STRING, allowNull: true },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  birthday: { type: DataTypes.STRING, allowNull: true },
  joinedOn: { type: DataTypes.STRING, allowNull: true },
  showBirthday: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, { sequelize, modelName: 'User', tableName: 'users' });
