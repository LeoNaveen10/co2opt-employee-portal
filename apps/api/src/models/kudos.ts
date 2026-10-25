import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../database/connection';

export class Kudos extends Model {
  declare id: string;
  declare fromId: string;
  declare toId: string;
  declare message: string;
  declare createdAt: Date;
}

Kudos.init({
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  fromId: { type: DataTypes.STRING, allowNull: false },
  toId: { type: DataTypes.STRING, allowNull: false },
  message: { type: DataTypes.STRING(280), allowNull: false },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, { sequelize, modelName: 'Kudos', tableName: 'kudos' });
