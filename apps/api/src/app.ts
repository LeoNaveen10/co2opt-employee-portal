import express from 'express';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { allowedWebOrigins, sessionSecret } from './config';
import { sequelize } from './models';
import { errorHandler } from './middleware/error-handler';
import { createHealthRouter } from './features/health/routes';
import authRoutes from './features/auth/routes';
import usersRoutes from './features/users/routes';
import leaveRoutes from './features/leave/routes';
import calendarRoutes from './features/calendar/routes';
import recommendationsRoutes from './features/recommendations/routes';
import teamRoutes from './features/team/routes';
import jiraRoutes from './features/jira/routes';
import timeTrackingRoutes from './features/time-tracking/routes';

export const app = express();

app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedWebOrigins.has(origin));
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(createHealthRouter(() => sequelize.authenticate()));

app.use(authRoutes);
app.use(usersRoutes);
app.use(leaveRoutes);
app.use(calendarRoutes);
app.use(recommendationsRoutes);
app.use(teamRoutes);
app.use(jiraRoutes);
app.use(timeTrackingRoutes);

app.use(errorHandler);
