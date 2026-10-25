import type { Request, Response, NextFunction } from 'express';
import { User } from '../../models';
import { employeeEmails } from '../../config';

export const safeUserAttributes = ['id', 'email', 'name', 'role', 'birthday', 'joinedOn', 'showBirthday'];

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export type SafeUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  birthday: string | null;
  joinedOn: string | null;
  showBirthday: boolean;
};

export async function getSafeUser(userId: string): Promise<SafeUser | null> {
  const user = await User.findByPk(userId, { attributes: [...safeUserAttributes, 'active'] });
  if (!user || !user.active || !employeeEmails.has(user.email)) return null;
  return user.get({ plain: true }) as SafeUser;
}

export async function getCurrentUser(req: Request) {
  if (!req.session.userId) return null;
  return getSafeUser(req.session.userId);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    if (!await getCurrentUser(req)) return res.status(401).json({ message: 'Not authenticated' });
    next();
  } catch (error) {
    next(error);
  }
}
