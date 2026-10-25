import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/session';
import { Op } from 'sequelize';
import { User, LeaveRequest } from '../../models';
import { toISODate, isISODate, enumerateDates, calculateLeaveDays } from '../../utils/dates';
import { csvCell } from '../../utils/csv';

const ANNUAL_LEAVE = 23;

const router = Router();

router.get('/leave/requests', requireAuth, async (_req, res) => {
  const requests = await LeaveRequest.findAll({
    where: { status: { [Op.in]: ['APPROVED', 'PENDING'] } },
    include: [{ model: User, as: 'employee', attributes: ['id', 'name', 'email'] }],
    order: [['createdAt', 'DESC']]
  });
  res.json({ requests });
});

router.get('/leave/summary', requireAuth, async (_req, res) => {
  const year = new Date().getUTCFullYear();
  const users = await User.findAll({
    where: { active: true },
    include: [{
      model: LeaveRequest,
      as: 'requestedLeaves',
      required: false,
      where: {
        status: { [Op.in]: ['APPROVED', 'PENDING'] },
        startDate: { [Op.between]: [`${year}-01-01`, `${year}-12-31`] }
      }
    }],
    order: [['name', 'ASC']]
  });
  const summary = users.map((user) => {
    const taken = (user.requestedLeaves ?? []).reduce((total, leave) => total + leave.days, 0);
    return { userId: user.id, name: user.name, allocation: ANNUAL_LEAVE, taken, remaining: Math.max(ANNUAL_LEAVE - taken, 0) };
  });
  res.json({ annualLeave: ANNUAL_LEAVE, summary });
});

router.get('/leave/report', requireAuth, async (req, res) => {
  const parsed = z.object({
    period: z.enum(['month', 'year']),
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12).optional()
  }).safeParse(req.query);
  if (!parsed.success || (parsed.data.period === 'month' && !parsed.data.month)) {
    return res.status(400).json({ message: 'Choose a valid month and year or a valid year for the report' });
  }

  const { period, year, month } = parsed.data;
  const rangeStart = period === 'month' ? `${year}-${String(month).padStart(2, '0')}-01` : `${year}-01-01`;
  const rangeEnd = period === 'month'
    ? `${year}-${String(month).padStart(2, '0')}-${new Date(Date.UTC(year, month!, 0)).getUTCDate()}`
    : `${year}-12-31`;
  const users = await User.findAll({ where: { active: true }, order: [['name', 'ASC']] });
  const leaves = await LeaveRequest.findAll({
    where: {
      status: { [Op.in]: ['APPROVED', 'PENDING'] },
      startDate: { [Op.lte]: rangeEnd },
      endDate: { [Op.gte]: rangeStart }
    },
    include: [{ model: User, as: 'employee', attributes: ['id'] }]
  });
  const yearlyLeaves = period === 'month' ? await LeaveRequest.findAll({
    where: {
      status: { [Op.in]: ['APPROVED', 'PENDING'] },
      startDate: { [Op.gte]: `${year}-01-01`, [Op.lte]: `${year}-12-31` }
    }
  }) : leaves;
  const reportLabel = period === 'month' ? `${year}-${String(month).padStart(2, '0')}` : String(year);
  const rows = [
    ['Employee', 'Email', 'Period', 'Leave taken (days)', 'Annual allocation', 'Annual taken (days)', 'Annual remaining (days)'],
    ...users.map((user) => {
      const userLeaves = leaves.filter((leave) => leave.employeeId === user.id);
      const periodTaken = userLeaves.reduce((total, leave) => {
        const start = leave.startDate > rangeStart ? leave.startDate : rangeStart;
        const end = leave.endDate < rangeEnd ? leave.endDate : rangeEnd;
        return total + calculateLeaveDays(start, end);
      }, 0);
      const annualTaken = yearlyLeaves
        .filter((leave) => leave.employeeId === user.id)
        .reduce((total, leave) => total + leave.days, 0);
      return [
        user.name,
        user.email,
        reportLabel,
        periodTaken,
        ANNUAL_LEAVE,
        annualTaken,
        Math.max(ANNUAL_LEAVE - annualTaken, 0)
      ];
    })
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  res.type('text/csv').set('Content-Disposition', `attachment; filename="leave-report-${reportLabel}.csv"`).send(csv);
});

router.post('/leave/requests', requireAuth, async (req, res) => {
  const user = await User.findByPk(req.session.userId);
  const parsed = z.object({
    startDate: z.string().refine(isISODate),
    endDate: z.string().refine(isISODate),
    note: z.string().max(280).optional().nullable()
  }).safeParse(req.body);
  if (!parsed.success || !user) return res.status(400).json({ message: 'Invalid payload' });

  const { startDate, endDate, note } = parsed.data;
  if (startDate > endDate) return res.status(400).json({ message: 'Start date must be before or equal to end date' });
  if (startDate.slice(0, 4) !== endDate.slice(0, 4)) return res.status(400).json({ message: 'Use valid dates within one calendar year' });
  if ((toISODate(endDate).getTime() - toISODate(startDate).getTime()) / 86400000 > 366) {
    return res.status(400).json({ message: 'Leave date range is too long' });
  }

  const overlaps = await LeaveRequest.findAll({
    where: { employeeId: user.id, status: { [Op.in]: ['PENDING', 'APPROVED'] } }
  });
  const requestedDates = new Set(enumerateDates(startDate, endDate));
  if (overlaps.some((leave) => enumerateDates(leave.startDate, leave.endDate).some((date) => requestedDates.has(date)))) {
    return res.status(400).json({ message: 'Overlapping leave request already exists' });
  }

  const days = calculateLeaveDays(startDate, endDate);
  if (days <= 0) return res.status(400).json({ message: 'This range contains no working leave days' });
  const leaveUsed = await LeaveRequest.sum('days', {
    where: {
      employeeId: user.id,
      status: { [Op.in]: ['APPROVED', 'PENDING'] },
      startDate: { [Op.between]: [`${startDate.slice(0, 4)}-01-01`, `${startDate.slice(0, 4)}-12-31`] }
    }
  }) ?? 0;
  if (leaveUsed + days > ANNUAL_LEAVE) return res.status(400).json({ message: 'Not enough leave balance' });

  const leave = await LeaveRequest.create({
    employeeId: user.id,
    startDate,
    endDate,
    days,
    note: note || null,
    status: 'APPROVED'
  });
  const created = await LeaveRequest.findByPk(leave.id, {
    include: [{ model: User, as: 'employee', attributes: ['id', 'name', 'email'] }]
  });
  res.json({ leave: created });
});

export default router;
