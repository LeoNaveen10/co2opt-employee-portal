import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/session';
import { User, Kudos } from '../../models';

const router = Router();

router.get('/kudos', requireAuth, async (_req, res) => {
  const items = await Kudos.findAll({
    include: [
      { model: User, as: 'from', attributes: ['id', 'name'] },
      { model: User, as: 'to', attributes: ['id', 'name'] }
    ],
    order: [['createdAt', 'DESC']]
  });
  res.json({ items });
});

router.post('/kudos', requireAuth, async (req, res) => {
  const parsed = z.object({ toId: z.string(), message: z.string().min(3).max(280) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const recipient = await User.findByPk(parsed.data.toId);
  if (!recipient) return res.status(404).json({ message: 'Teammate not found' });
  const item = await Kudos.create({ fromId: req.session.userId!, toId: recipient.id, message: parsed.data.message });
  const created = await Kudos.findByPk(item.id, {
    include: [
      { model: User, as: 'from', attributes: ['id', 'name'] },
      { model: User, as: 'to', attributes: ['id', 'name'] }
    ]
  });
  res.json({ item: created });
});

router.get('/celebrations', requireAuth, async (_req, res) => {
  const users = await User.findAll({
    attributes: ['id', 'name', 'birthday', 'joinedOn', 'showBirthday'],
    order: [['name', 'ASC']]
  });
  res.json({
    birthdays: users.filter((user) => user.showBirthday && user.birthday),
    anniversaries: users.filter((user) => user.joinedOn)
  });
});

export default router;
