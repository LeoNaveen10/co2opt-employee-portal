import { Router } from 'express';
import { requireAuth } from '../auth/session';
import { Op } from 'sequelize';
import { User, LeaveRequest } from '../../models';

const router = Router();

router.get('/calendar', requireAuth, async (_req, res) => {
  const leaves = await LeaveRequest.findAll({
    where: { status: { [Op.in]: ['PENDING', 'APPROVED'] } },
    include: [{ model: User, as: 'employee', attributes: ['id', 'name'] }],
    order: [['startDate', 'ASC']]
  });
  res.json({ leaves });
});

export default router;
