import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 4000);
const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173';
const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-not-for-production';
const ANNUAL_LEAVE = 23;

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

type SafeUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  birthday: string | null;
  joinedOn: string | null;
  showBirthday: boolean;
};

app.use(cors({ origin: webOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

function sha(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function toISODate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function isISODate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
}
function datesSpan(start: string, end: string) {
  return (toISODate(end).getTime()-toISODate(start).getTime())/86400000;
}
function enumerateDates(start: string, end: string) {
  const result: string[] = [];
  const current = toISODate(start);
  const finish = toISODate(end);
  while (current <= finish) {
    result.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}

async function calculateLeaveDays(startDate: string, endDate: string) {
  const holidays = await prisma.publicHoliday.findMany({ select: { date: true } });
  const holidaySet = new Set(holidays.map((item) => item.date));
  const dates = enumerateDates(startDate, endDate);
  return dates.filter((dateString) => {
    const date = toISODate(dateString);
    return !isWeekend(date) && !holidaySet.has(dateString);
  }).length;
}

async function getSafeUser(userId: string): Promise<SafeUser | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, birthday: true, joinedOn: true, showBirthday: true }
  });
}

async function getCurrentUser(req: Request) {
  if (!req.session.userId) return null;
  return getSafeUser(req.session.userId);
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) return res.status(401).json({ message: 'Not authenticated' });
  next();
}

async function requireManager(req: Request, res: Response, next: NextFunction) {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ message: 'Not authenticated' });
  if (!['MANAGER', 'ADMIN'].includes(user.role)) return res.status(403).json({ message: 'Manager or admin role required' });
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ message: 'Not authenticated' });
  if (user.role !== 'ADMIN') return res.status(403).json({ message: 'Admin role required' });
  next();
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/auth/me', async (req, res) => {
  const user = await getCurrentUser(req);
  res.json({ user });
});

app.post('/auth/activate', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    inviteToken: z.string().min(24),
    password: z.string().min(8),
    birthday: z.string().refine(isISODate).optional().nullable(),
    joinedOn: z.string().refine(isISODate).optional().nullable()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload', errors: parsed.error.flatten() });
  const email = parsed.data.email.trim().toLowerCase();
  if (email.split('@')[1] !== 'co2opt.com') return res.status(400).json({ message: 'Only co2opt.com emails are allowed' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !user.inviteHash) return res.status(404).json({ message: 'Email is not allowlisted' });
  if (user.passwordHash) return res.status(400).json({ message: 'Account already activated' });
  if (sha(parsed.data.inviteToken) !== user.inviteHash) return res.status(400).json({ message: 'Invalid invite token' });

  const passwordHash = await argon2.hash(parsed.data.password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, inviteHash: null, birthday: parsed.data.birthday || null, joinedOn: parsed.data.joinedOn || null }
  });
  req.session.userId = user.id;
  res.json({ user: await getSafeUser(user.id) });
});

app.post('/auth/login', async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(8) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !user.passwordHash) return res.status(400).json({ message: 'Account not activated or not found' });
  const valid = await argon2.verify(user.passwordHash, parsed.data.password);
  if (!valid) return res.status(400).json({ message: 'Invalid email or password' });
  req.session.userId = user.id;
  res.json({ user: await getSafeUser(user.id) });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/users', requireAuth, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, birthday: true, joinedOn: true, showBirthday: true },
    orderBy: { name: 'asc' }
  });
  res.json({ users });
});

app.patch('/users/me', requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const schema = z.object({ birthday: z.string().refine(isISODate).nullable(), joinedOn: z.string().refine(isISODate).nullable(), showBirthday: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const user = await prisma.user.update({
    where: { id: userId },
    data: { birthday: parsed.data.birthday, joinedOn: parsed.data.joinedOn, showBirthday: parsed.data.showBirthday },
    select: { id: true, email: true, name: true, role: true, birthday: true, joinedOn: true, showBirthday: true }
  });
  res.json({ user });
});

app.get('/public-holidays', requireAuth, async (_req, res) => {
  const holidays = await prisma.publicHoliday.findMany({ orderBy: { date: 'asc' } });
  res.json({ holidays });
});

app.post('/public-holidays', requireAdmin, async (req, res) => {
  const schema = z.object({ date: z.string().refine(isISODate), name: z.string().min(2) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const holiday = await prisma.publicHoliday.upsert({
    where: { date: parsed.data.date },
    update: { name: parsed.data.name },
    create: parsed.data
  });
  res.json({ holiday });
});

app.get('/leave/requests', requireAuth, async (_req, res) => {
  const requests = await prisma.leaveRequest.findMany({
    include: {
      employee: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true, email: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ requests });
});

app.get('/leave/summary', requireAuth, async (_req, res) => {
  const year = new Date().getUTCFullYear().toString();
  const users = await prisma.user.findMany({
    where: {active: true},
    include: { requestedLeaves: { where: {startDate: {gte: year+'-01-01', lte: year+'-12-31'}} } },
    orderBy: { name: 'asc' }
  });
  const summary = users.map((user) => {
    const approved = user.requestedLeaves.filter((leave) => leave.status === 'APPROVED').reduce((sum, leave) => sum + leave.days, 0);
    const pending = user.requestedLeaves.filter((leave) => leave.status === 'PENDING').reduce((sum, leave) => sum + leave.days, 0);
    return {
      userId: user.id,
      name: user.name,
      role: user.role,
      allocation: ANNUAL_LEAVE,
      approved,
      pending,
      remaining: Math.max(ANNUAL_LEAVE - approved, 0)
    };
  });
  res.json({ annualLeave: ANNUAL_LEAVE, summary });
});

app.post('/leave/requests', requireAuth, async (req, res) => {
  const user = await getCurrentUser(req);
  const schema = z.object({ startDate: z.string().refine(isISODate), endDate: z.string().refine(isISODate), note: z.string().max(280).optional().nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !user) return res.status(400).json({ message: 'Invalid payload' });

  const { startDate, endDate, note } = parsed.data;
  if (startDate > endDate) return res.status(400).json({ message: 'Start date must be before or equal to end date' });

  if (!isISODate(startDate) || !isISODate(endDate) || startDate.slice(0,4) !== endDate.slice(0,4)) return res.status(400).json({ message: 'Use valid dates within one calendar year' });
  if (datesSpan(startDate, endDate) > 366) return res.status(400).json({ message: 'Leave date range is too long' });
  const dates = enumerateDates(startDate, endDate);
  const overlaps = await prisma.leaveRequest.findMany({
    where: {
      employeeId: user.id,
      status: { in: ['PENDING', 'APPROVED'] }
    }
  });
  const overlapFound = overlaps.some((leave) => {
    const existing = enumerateDates(leave.startDate, leave.endDate);
    return existing.some((date) => dates.includes(date));
  });
  if (overlapFound) return res.status(400).json({ message: 'Overlapping leave request already exists' });

  const days = await calculateLeaveDays(startDate, endDate);
  if (days <= 0) return res.status(400).json({ message: 'This range contains no working leave days' });

  const approvedUsed = await prisma.leaveRequest.aggregate({
    _sum: { days: true },
    where: { employeeId: user.id, status: 'APPROVED', startDate: {gte: startDate.slice(0,4)+'-01-01',lte: startDate.slice(0,4)+'-12-31'} }
  });
  const approvedDays = approvedUsed._sum.days ?? 0;
  if (approvedDays + days > ANNUAL_LEAVE) {
    return res.status(400).json({ message: 'Not enough leave balance' });
  }

  const leave = await prisma.leaveRequest.create({
    data: { employeeId: user.id, startDate, endDate, days, note: note || null, status: 'PENDING' },
    include: { employee: { select: { id: true, name: true, email: true } } }
  });
  res.json({ leave });
});

app.post('/leave/requests/:id/decision', requireManager, async (req, res) => {
  const reviewer = await getCurrentUser(req);
  const schema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !reviewer) return res.status(400).json({ message: 'Invalid payload' });

  const leave = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
  if (!leave) return res.status(404).json({ message: 'Leave request not found' });
  if (leave.employeeId === reviewer.id) return res.status(400).json({ message: 'You cannot approve your own leave' });
  if (leave.status !== 'PENDING') return res.status(400).json({ message: 'Only pending requests can be reviewed' });

  if (parsed.data.decision === 'APPROVED') {
    const approvedUsed = await prisma.leaveRequest.aggregate({
      _sum: { days: true },
      where: { employeeId: leave.employeeId, status: 'APPROVED', startDate: {gte: leave.startDate.slice(0,4)+'-01-01',lte: leave.startDate.slice(0,4)+'-12-31'} }
    });
    const approvedDays = approvedUsed._sum.days ?? 0;
    if (approvedDays + leave.days > ANNUAL_LEAVE) {
      return res.status(400).json({ message: 'Approval would exceed the employee\'s annual balance' });
    }
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: leave.id },
    data: { status: parsed.data.decision, reviewerId: reviewer.id, reviewedAt: new Date() },
    include: {
      employee: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true, email: true } }
    }
  });
  res.json({ leave: updated });
});

app.get('/calendar', requireAuth, async (_req, res) => {
  const approved = await prisma.leaveRequest.findMany({
    where: { status: 'APPROVED' },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: { startDate: 'asc' }
  });
  const holidays = await prisma.publicHoliday.findMany({ orderBy: { date: 'asc' } });
  res.json({ approved, holidays });
});

app.get('/recommendations', requireAuth, async (_req, res) => {
  const items = await prisma.recommendation.findMany({
    include: {
      author: { select: { id: true, name: true } },
      likes: true,
      ratings: true
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ items });
});

app.post('/recommendations', requireAuth, async (req, res) => {
  const user = await getCurrentUser(req);
  const schema = z.object({
    type: z.enum(['MOVIE', 'SERIES', 'BOOK', 'MUSIC']),
    title: z.string().min(1),
    url: z.string().optional().nullable(),
    note: z.string().max(300).optional().nullable()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !user) return res.status(400).json({ message: 'Invalid payload' });
  const item = await prisma.recommendation.create({
    data: { ...parsed.data, url: parsed.data.url || null, note: parsed.data.note || null, authorId: user.id },
    include: { author: { select: { id: true, name: true } }, likes: true, ratings: true }
  });
  res.json({ item });
});

app.post('/recommendations/:id/like', requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const existing = await prisma.like.findUnique({ where: { userId_recommendationId: { userId, recommendationId: req.params.id } } });
  if (existing) {
    await prisma.like.delete({ where: { userId_recommendationId: { userId, recommendationId: req.params.id } } });
  } else {
    await prisma.like.create({ data: { userId, recommendationId: req.params.id } });
  }
  res.json({ ok: true });
});

app.post('/recommendations/:id/rate', requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const schema = z.object({ score: z.number().int().min(1).max(5) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  await prisma.rating.upsert({
    where: { userId_recommendationId: { userId, recommendationId: req.params.id } },
    update: { score: parsed.data.score },
    create: { userId, recommendationId: req.params.id, score: parsed.data.score }
  });
  res.json({ ok: true });
});

app.get('/kudos', requireAuth, async (_req, res) => {
  const items = await prisma.kudos.findMany({
    include: { from: { select: { id: true, name: true } }, to: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ items });
});

app.post('/kudos', requireAuth, async (req, res) => {
  const fromId = req.session.userId!;
  const schema = z.object({ toId: z.string(), message: z.string().min(3).max(280) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const item = await prisma.kudos.create({
    data: { fromId, toId: parsed.data.toId, message: parsed.data.message },
    include: { from: { select: { id: true, name: true } }, to: { select: { id: true, name: true } } }
  });
  res.json({ item });
});

app.get('/polls', requireAuth, async (_req, res) => {
  const polls = await prisma.poll.findMany({
    include: { votes: true, creator: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ polls });
});

app.post('/polls', requireAuth, async (req, res) => {
  const creatorId = req.session.userId!;
  const schema = z.object({
    question: z.string().min(3),
    options: z.array(z.string().min(1)).min(2).max(8),
    closesAt: z.string()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const poll = await prisma.poll.create({
    data: { question: parsed.data.question, optionsJson: JSON.stringify(parsed.data.options), closesAt: new Date(parsed.data.closesAt), createdBy: creatorId },
    include: { votes: true, creator: { select: { id: true, name: true } } }
  });
  res.json({ poll });
});

app.post('/polls/:id/vote', requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const schema = z.object({ optionIndex: z.number().int().min(0) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const poll = await prisma.poll.findUnique({ where: { id: req.params.id } });
  if (!poll) return res.status(404).json({ message: 'Poll not found' });
  if (parsed.data.optionIndex >= (JSON.parse(poll.optionsJson) as string[]).length) return res.status(400).json({message:'Invalid poll option'});
  if (new Date(poll.closesAt) < new Date()) return res.status(400).json({ message: 'Poll already closed' });
  await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId: req.params.id, userId } },
    update: { optionIndex: parsed.data.optionIndex },
    create: { pollId: req.params.id, userId, optionIndex: parsed.data.optionIndex }
  });
  res.json({ ok: true });
});

app.get('/wheel-presets', requireAuth, async (_req, res) => {
  const presets = await prisma.wheelPreset.findMany({ include: { creator: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } });
  res.json({ presets });
});

app.post('/wheel-presets', requireAuth, async (req, res) => {
  const creatorId = req.session.userId!;
  const schema = z.object({ name: z.string().min(2), options: z.array(z.string().min(1)).min(2).max(12) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const preset = await prisma.wheelPreset.create({
    data: { name: parsed.data.name, optionsJson: JSON.stringify(parsed.data.options), createdBy: creatorId },
    include: { creator: { select: { id: true, name: true } } }
  });
  res.json({ preset });
});

app.get('/celebrations', requireAuth, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, birthday: true, joinedOn: true, showBirthday: true },
    orderBy: { name: 'asc' }
  });
  const birthdays = users.filter((u) => u.showBirthday && u.birthday);
  const anniversaries = users.filter((u) => u.joinedOn);
  res.json({ birthdays, anniversaries });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`CO2OPT API running on http://localhost:${port}`);
});