import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../database/connection';

export class Like extends Model {
  declare userId: string;
  declare recommendationId: string;
}

Like.init({
  userId: { type: DataTypes.STRING, primaryKey: true },
  recommendationId: { type: DataTypes.STRING, primaryKey: true }
}, { sequelize, modelName: 'Like', tableName: 'likes', timestamps: false });
