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
const allowedWebOrigins = new Set([
  webOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);
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

app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedWebOrigins.has(origin));
  },
  credentials: true
}));
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

function calculateLeaveDays(startDate: string, endDate: string) {
  const dates = enumerateDates(startDate, endDate);
  return dates.filter((dateString) => {
    const date = toISODate(dateString);
    return !isWeekend(date);
  }).length;
}

const recommendationSchema = z.object({
  type: z.enum(['MOVIE', 'SERIES', 'BOOK', 'MUSIC']),
  title: z.string().trim().min(1),
  url: z.string().optional().nullable(),
  imageUrl: z.string().url().refine((value) => value.startsWith('https://'), 'Artwork URL must use HTTPS').or(z.literal('')).optional().nullable(),
  note: z.string().max(300).optional().nullable()
});

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

app.get('/leave/requests', requireAuth, async (_req, res) => {
  const requests = await prisma.leaveRequest.findMany({
    where: { status: { in: ['APPROVED', 'PENDING'] } },
    include: {
      employee: { select: { id: true, name: true, email: true } }
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
    const taken = user.requestedLeaves
      .filter((leave) => ['APPROVED', 'PENDING'].includes(leave.status))
      .reduce((sum, leave) => sum + leave.days, 0);
    return {
      userId: user.id,
      name: user.name,
      allocation: ANNUAL_LEAVE,
      taken,
      remaining: Math.max(ANNUAL_LEAVE - taken, 0)
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

  const days = calculateLeaveDays(startDate, endDate);
  if (days <= 0) return res.status(400).json({ message: 'This range contains no working leave days' });

  const leaveUsed = await prisma.leaveRequest.aggregate({
    _sum: { days: true },
    where: { employeeId: user.id, status: { in: ['APPROVED', 'PENDING'] }, startDate: {gte: startDate.slice(0,4)+'-01-01',lte: startDate.slice(0,4)+'-12-31'} }
  });
  const takenDays = leaveUsed._sum.days ?? 0;
  if (takenDays + days > ANNUAL_LEAVE) {
    return res.status(400).json({ message: 'Not enough leave balance' });
  }

  const leave = await prisma.leaveRequest.create({
    data: { employeeId: user.id, startDate, endDate, days, note: note || null, status: 'APPROVED' },
    include: { employee: { select: { id: true, name: true, email: true } } }
  });
  res.json({ leave });
});

app.get('/calendar', requireAuth, async (_req, res) => {
  const leaves = await prisma.leaveRequest.findMany({
    where: { status: { in: ['PENDING', 'APPROVED'] } },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: { startDate: 'asc' }
  });
  res.json({ leaves });
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

app.get('/recommendations/search', requireAuth, async (req, res) => {
  const schema = z.object({
    type: z.enum(['MOVIE', 'SERIES', 'MUSIC']),
    term: z.string().trim().min(2).max(100)
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: 'Choose a movie, series or music title to search for' });

  const { type, term } = parsed.data;
  const catalog = new URL('https://itunes.apple.com/search');
  catalog.searchParams.set('term', term);
  catalog.searchParams.set('limit', '8');
  if (type === 'MUSIC') {
    catalog.searchParams.set('media', 'music');
    catalog.searchParams.set('entity', 'song');
  } else if (type === 'SERIES') {
    catalog.searchParams.set('media', 'tv');
    catalog.searchParams.set('entity', 'tvSeason');
  } else {
    catalog.searchParams.set('media', 'movie');
    catalog.searchParams.set('entity', 'movie');
  }

  let response: globalThis.Response;
  try {
    response = await fetch(catalog, { signal: AbortSignal.timeout(8000) });
  } catch {
    return res.status(502).json({ message: 'Artwork search is temporarily unavailable. Please try again.' });
  }
  if (!response.ok) return res.status(502).json({ message: 'Artwork search is temporarily unavailable. Please try again.' });

  const appleResponseSchema = z.object({
    results: z.array(z.object({
      trackId: z.number().optional(),
      collectionId: z.number().optional(),
      trackName: z.string().nullish(),
      collectionName: z.string().nullish(),
      artistName: z.string().nullish(),
      artworkUrl100: z.string().url().nullish(),
      trackViewUrl: z.string().url().nullish(),
      collectionViewUrl: z.string().url().nullish()
    }))
  });
  const responseBody: unknown = await response.json().catch(() => null);
  const appleResponse = appleResponseSchema.safeParse(responseBody);
  if (!appleResponse.success) return res.status(502).json({ message: 'Artwork search returned an invalid response. Please try again.' });

  const results = appleResponse.data.results.flatMap((item) => {
    const title = type === 'SERIES'
      ? item.artistName || item.collectionName || item.trackName
      : item.trackName || item.collectionName;
    const imageUrl = item.artworkUrl100;
    if (!title || !imageUrl) return [];
    const id = item.trackId ?? item.collectionId;
    return [{
      id: String(id ?? `${title}-${imageUrl}`),
      title,
      artist: item.artistName && item.artistName !== title ? item.artistName : undefined,
      url: item.trackViewUrl ?? item.collectionViewUrl ?? undefined,
      imageUrl
    }];
  }).filter((item, index, items) => items.findIndex((result) => result.title === item.title) === index);
  res.json({ results });
});

app.post('/recommendations', requireAuth, async (req, res) => {
  const user = await getCurrentUser(req);
  const parsed = recommendationSchema.safeParse(req.body);
  if (!parsed.success || !user) return res.status(400).json({ message: 'Invalid payload' });
  const item = await prisma.recommendation.create({
    data: { ...parsed.data, url: parsed.data.url || null, imageUrl: parsed.data.imageUrl || null, note: parsed.data.note || null, authorId: user.id },
    include: { author: { select: { id: true, name: true } }, likes: true, ratings: true }
  });
  res.json({ item });
});

app.patch('/recommendations/:id', requireAuth, async (req: Request<{ id: string }>, res) => {
  const userId = req.session.userId!;
  const parsed = recommendationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });

  const existing = await prisma.recommendation.findUnique({
    where: { id: req.params.id },
    select: { authorId: true }
  });
  if (!existing) return res.status(404).json({ message: 'Recommendation not found' });
  if (existing.authorId !== userId) return res.status(403).json({ message: 'You can only edit your own recommendations' });

  const item = await prisma.recommendation.update({
    where: { id: req.params.id },
    data: {
      ...parsed.data,
      url: parsed.data.url || null,
      imageUrl: parsed.data.imageUrl || null,
      note: parsed.data.note || null
    },
    include: { author: { select: { id: true, name: true } }, likes: true, ratings: true }
  });
  res.json({ item });
});

app.delete('/recommendations/:id', requireAuth, async (req: Request<{ id: string }>, res) => {
  const result = await prisma.recommendation.deleteMany({
    where: { id: req.params.id, authorId: req.session.userId }
  });
  if (!result.count) return res.status(404).json({ message: 'Recommendation not found or not yours to delete' });
  res.json({ ok: true });
});

app.post('/recommendations/:id/like', requireAuth, async (req: Request<{ id: string }>, res) => {
  const userId = req.session.userId!;
  const existing = await prisma.like.findUnique({ where: { userId_recommendationId: { userId, recommendationId: req.params.id } } });
  if (existing) {
    await prisma.like.delete({ where: { userId_recommendationId: { userId, recommendationId: req.params.id } } });
  } else {
    await prisma.like.create({ data: { userId, recommendationId: req.params.id } });
  }
  res.json({ ok: true });
});

app.post('/recommendations/:id/rate', requireAuth, async (req: Request<{ id: string }>, res) => {
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