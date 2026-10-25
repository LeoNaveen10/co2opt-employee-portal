import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { parseEmployeeEmails } from '../employee-emails';

export const port = Number(process.env.PORT || 4000);
export const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173';
export const allowedWebOrigins = new Set([webOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173']);
export const employeeEmails = parseEmployeeEmails(process.env.EMPLOYEE_EMAILS);
export const sessionSecret = randomBytes(48).toString('hex');
