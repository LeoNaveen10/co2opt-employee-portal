import { Router } from 'express';
import { z } from 'zod';
import { getSafeUser, getCurrentUser } from './session';
import argon2 from 'argon2';
import { employeeEmails } from '../../config';
import { User, sequelize } from '../../models';
import { isISODate } from '../../utils/dates';

const router = Router();

router.get('/auth/me', async (req, res) => {
  res.json({ user: await getCurrentUser(req) });
});

router.post('/auth/check-email', (req, res) => {
  const parsed = z.object({ email: z.string().trim().toLowerCase().email() }).safeParse(req.body);
  res.set('Cache-Control', 'no-store').json({ allowed: parsed.success && employeeEmails.has(parsed.data.email) });
});

router.post('/auth/signup', async (req, res, next) => {
  const parsed = z.object({
    email: z.string().trim().toLowerCase().email(),
    name: z.string().trim().min(1).max(100),
    role: z.string().trim().min(1).max(100),
    password: z.string().min(8),
    birthday: z.string().refine(isISODate).optional().nullable(),
    joinedOn: z.string().refine(isISODate).optional().nullable()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter a name, role, valid email and password of at least 8 characters' });
  const { email, name, role, password, birthday, joinedOn } = parsed.data;
  if (!employeeEmails.has(email)) return res.status(403).json({ message: 'Email is not allowlisted' });
  try {
    const user = await sequelize.transaction(async (transaction) => {
      const existing = await User.findOne({ where: { email }, transaction, lock: transaction.LOCK.UPDATE });
      if (existing?.passwordHash || (existing && !existing.active)) return null;
      const values = { name, role, passwordHash: await argon2.hash(password), birthday: birthday || null, joinedOn: joinedOn || null };
      return existing ? existing.update(values, { transaction }) : User.create({ email, ...values }, { transaction });
    });
    if (!user) return res.status(409).json({ message: 'Account already exists. Please log in.' });
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.userId = user.id;
      void getSafeUser(user.id).then((safeUser) => res.json({ user: safeUser })).catch(next);
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Account already exists. Please log in.' });
    }
    next(error);
  }
});

router.post('/auth/login', async (req, res, next) => {
  const parsed = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(8) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const email = parsed.data.email.trim().toLowerCase();
  if (!employeeEmails.has(email)) return res.status(403).json({ message: 'Email is not allowlisted' });
  const user = await User.findOne({ where: { email } });
  if (!user || !user.active || !user.passwordHash) return res.status(400).json({ message: 'Invalid email or password' });
  if (!await argon2.verify(user.passwordHash, parsed.data.password)) return res.status(400).json({ message: 'Invalid email or password' });
  req.session.regenerate((error) => {
    if (error) return next(error);
    req.session.userId = user.id;
    void getSafeUser(user.id).then((safeUser) => res.json({ user: safeUser })).catch(next);
  });
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

export default router;
