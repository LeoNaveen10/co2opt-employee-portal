import 'dotenv/config';
import { Sequelize, DataTypes, Model } from 'sequelize';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL must point to the local PostgreSQL database.');
}

export const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: false
});

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

export class Like extends Model {
  declare userId: string;
  declare recommendationId: string;
}

Like.init({
  userId: { type: DataTypes.STRING, primaryKey: true },
  recommendationId: { type: DataTypes.STRING, primaryKey: true }
}, { sequelize, modelName: 'Like', tableName: 'likes', timestamps: false });

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

User.hasMany(LeaveRequest, { as: 'requestedLeaves', foreignKey: 'employeeId' });
LeaveRequest.belongsTo(User, { as: 'employee', foreignKey: 'employeeId' });
User.hasMany(LeaveRequest, { as: 'reviewedLeaves', foreignKey: 'reviewerId' });
LeaveRequest.belongsTo(User, { as: 'reviewer', foreignKey: 'reviewerId' });
User.hasMany(Recommendation, { foreignKey: 'authorId' });
Recommendation.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
User.hasMany(Like, { foreignKey: 'userId' });
Like.belongsTo(User, { as: 'user', foreignKey: 'userId' });
Recommendation.hasMany(Like, { as: 'likes', foreignKey: 'recommendationId', onDelete: 'CASCADE' });
Like.belongsTo(Recommendation, { foreignKey: 'recommendationId' });
User.hasMany(Rating, { foreignKey: 'userId' });
Rating.belongsTo(User, { as: 'user', foreignKey: 'userId' });
Recommendation.hasMany(Rating, { as: 'ratings', foreignKey: 'recommendationId', onDelete: 'CASCADE' });
Rating.belongsTo(Recommendation, { foreignKey: 'recommendationId' });
User.hasMany(Kudos, { as: 'kudosSent', foreignKey: 'fromId' });
Kudos.belongsTo(User, { as: 'from', foreignKey: 'fromId' });
User.hasMany(Kudos, { as: 'kudosReceived', foreignKey: 'toId' });
Kudos.belongsTo(User, { as: 'to', foreignKey: 'toId' });
