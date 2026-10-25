import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../database/connection';

export class Rating extends Model {
  declare userId: string;
  declare recommendationId: string;
  declare score: number;
}

Rating.init({
  userId: { type: DataTypes.STRING, primaryKey: true },
  recommendationId: { type: DataTypes.STRING, primaryKey: true },
  score: { type: DataTypes.INTEGER, allowNull: false }
}, { sequelize, modelName: 'Rating', tableName: 'ratings', timestamps: false });
