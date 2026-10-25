import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../database/connection';

export class Recommendation extends Model {
  declare id: string;
  declare type: string;
  declare title: string;
  declare url: string | null;
  declare imageUrl: string | null;
  declare note: string | null;
  declare authorId: string;
  declare createdAt: Date;
}

Recommendation.init({
  id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  type: { type: DataTypes.STRING, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  url: { type: DataTypes.TEXT, allowNull: true },
  imageUrl: { type: DataTypes.TEXT, allowNull: true },
  note: { type: DataTypes.STRING(300), allowNull: true },
  authorId: { type: DataTypes.STRING, allowNull: false },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, { sequelize, modelName: 'Recommendation', tableName: 'recommendations' });
