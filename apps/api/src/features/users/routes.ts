import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, getSafeUser, safeUserAttributes } from '../auth/session';
import { User } from '../../models';
import { isISODate } from '../../utils/dates';

const router = Router();

router.get('/users', requireAuth, async (_req, res) => {
  const users = await User.findAll({ attributes: safeUserAttributes, order: [['name', 'ASC']] });
  res.json({ users });
});

router.patch('/users/me', requireAuth, async (req, res) => {
  const parsed = z.object({
    role: z.string().trim().min(1).max(100).optional(),
    birthday: z.string().refine(isISODate).nullable(),
    joinedOn: z.string().refine(isISODate).nullable(),
    showBirthday: z.boolean()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const user = await User.findByPk(req.session.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  await user.update(parsed.data);
  res.json({ user: await getSafeUser(user.id) });
});

export default router;
