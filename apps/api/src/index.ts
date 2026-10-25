import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { parseEmployeeEmails } from './employee-emails';
import { Op } from 'sequelize';
import { z } from 'zod';
import { Kudos, LeaveRequest, Like, Rating, Recommendation, sequelize, User } from './models';

const app = express();
const port = Number(process.env.PORT || 4000);
const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173';
const allowedWebOrigins = new Set([webOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173']);
const employeeEmails = parseEmployeeEmails(process.env.EMPLOYEE_EMAILS);
const sessionSecret = randomBytes(48).toString('hex');
const ANNUAL_LEAVE = 23;
const safeUserAttributes = ['id', 'email', 'name', 'role', 'birthday', 'joinedOn', 'showBirthday'];

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

function toISODate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function isISODate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function enumerateDates(start: string, end: string) {
  const dates: string[] = [];
  const current = toISODate(start);
  const finish = toISODate(end);
  while (current <= finish) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function calculateLeaveDays(start: string, end: string) {
  return enumerateDates(start, end).filter((value) => {
    const weekday = toISODate(value).getUTCDay();
    return weekday !== 0 && weekday !== 6;
  }).length;
}

function csvCell(value: string | number) {
  const text = String(value);
  const safeText = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

const recommendationSchema = z.object({
  type: z.enum(['MOVIE', 'SERIES', 'BOOK', 'MUSIC']),
  title: z.string().trim().min(1),
  url: z.string().optional().nullable(),
  imageUrl: z.string().url().refine((value) => value.startsWith('https://'), 'Artwork URL must use HTTPS').or(z.literal('')).optional().nullable(),
  note: z.string().max(300).optional().nullable()
});

async function getSafeUser(userId: string): Promise<SafeUser | null> {
  const user = await User.findByPk(userId, { attributes: [...safeUserAttributes, 'active'] });
  if (!user || !user.active || !employeeEmails.has(user.email)) return null;
  return user.get({ plain: true }) as SafeUser;
}

async function getCurrentUser(req: Request) {
  if (!req.session.userId) return null;
  return getSafeUser(req.session.userId);
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    if (!await getCurrentUser(req)) return res.status(401).json({ message: 'Not authenticated' });
    next();
  } catch (error) {
    next(error);
  }
}

app.get('/health', async (_req, res) => {
  await sequelize.authenticate();
  res.json({ ok: true });
});

app.get('/auth/me', async (req, res) => {
  res.json({ user: await getCurrentUser(req) });
});

app.post('/auth/check-email', (req, res) => {
  const parsed = z.object({ email: z.string().trim().toLowerCase().email() }).safeParse(req.body);
  res.set('Cache-Control', 'no-store').json({ allowed: parsed.success && employeeEmails.has(parsed.data.email) });
});

app.post('/auth/signup', async (req, res, next) => {
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

app.post('/auth/login', async (req, res, next) => {
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

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/users', requireAuth, async (_req, res) => {
  const users = await User.findAll({ attributes: safeUserAttributes, order: [['name', 'ASC']] });
  res.json({ users });
});

app.patch('/users/me', requireAuth, async (req, res) => {
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

app.get('/leave/requests', requireAuth, async (_req, res) => {
  const requests = await LeaveRequest.findAll({
    where: { status: { [Op.in]: ['APPROVED', 'PENDING'] } },
    include: [{ model: User, as: 'employee', attributes: ['id', 'name', 'email'] }],
    order: [['createdAt', 'DESC']]
  });
  res.json({ requests });
});

app.get('/leave/summary', requireAuth, async (_req, res) => {
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

app.get('/leave/report', requireAuth, async (req, res) => {
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

app.post('/leave/requests', requireAuth, async (req, res) => {
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

app.get('/calendar', requireAuth, async (_req, res) => {
  const leaves = await LeaveRequest.findAll({
    where: { status: { [Op.in]: ['PENDING', 'APPROVED'] } },
    include: [{ model: User, as: 'employee', attributes: ['id', 'name'] }],
    order: [['startDate', 'ASC']]
  });
  res.json({ leaves });
});

app.get('/recommendations', requireAuth, async (_req, res) => {
  const items = await Recommendation.findAll({
    include: [
      { model: User, as: 'author', attributes: ['id', 'name'] },
      { model: Like, as: 'likes', attributes: ['userId', 'recommendationId'] },
      { model: Rating, as: 'ratings', attributes: ['userId', 'recommendationId', 'score'] }
    ],
    order: [['createdAt', 'DESC']]
  });
  res.json({ items });
});

app.get('/recommendations/search', requireAuth, async (req, res) => {
  const parsed = z.object({
    type: z.enum(['MOVIE', 'SERIES', 'BOOK', 'MUSIC']),
    term: z.string().trim().min(2).max(100)
  }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: 'Choose a movie, series or music title to search for' });

  const { type, term } = parsed.data;
  if (type === 'SERIES') {
    try {
      const response = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Series search failed');
      const shows = z.array(z.object({ show: z.object({
        id: z.number(), name: z.string(), url: z.string().url(),
        image: z.object({ medium: z.string().url().nullable(), original: z.string().url().nullable() }).nullable()
      }) })).parse(await response.json());
      const results = shows.flatMap(({ show }) => {
        const imageUrl = show.image?.medium ?? show.image?.original;
        return imageUrl ? [{ id: String(show.id), title: show.name, url: show.url, imageUrl }] : [];
      }).slice(0, 8);
      return res.json({ results });
    } catch {
      return res.status(502).json({ message: 'Series artwork search is temporarily unavailable. Please try again.' });
    }
  }
  const catalog = new URL('https://itunes.apple.com/search');
  catalog.searchParams.set('term', term);
  catalog.searchParams.set('limit', '50');
  catalog.searchParams.set('country', 'us');
  if (type === 'MUSIC') {
    catalog.searchParams.set('media', 'music');
    catalog.searchParams.set('entity', 'song,album');
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
      wrapperType: z.string().optional(),
      collectionType: z.string().optional(),
      kind: z.string().optional(),
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

  const results = appleResponse.data.results.filter((item) => {
    if (type === 'MOVIE') return item.kind === 'feature-movie';
    if (type === 'BOOK') return item.kind === 'ebook';
    return item.kind === 'song' || item.collectionType === 'Album';
  }).flatMap((item) => {
    const title = item.trackName || item.collectionName;
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
  }).filter((item, index, items) => items.findIndex((result) => result.title === item.title && result.artist === item.artist) === index);
  res.json({ results });
});

app.post('/recommendations', requireAuth, async (req, res) => {
  const parsed = recommendationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const author = await User.findByPk(req.session.userId);
  if (!author) return res.status(401).json({ message: 'Not authenticated' });
  const item = await Recommendation.create({
    ...parsed.data,
    url: parsed.data.url || null,
    imageUrl: parsed.data.imageUrl || null,
    note: parsed.data.note || null,
    authorId: author.id
  });
  const created = await Recommendation.findByPk(item.id, {
    include: [
      { model: User, as: 'author', attributes: ['id', 'name'] },
      { model: Like, as: 'likes', attributes: ['userId', 'recommendationId'] },
      { model: Rating, as: 'ratings', attributes: ['userId', 'recommendationId', 'score'] }
    ]
  });
  res.json({ item: created });
});

app.patch('/recommendations/:id', requireAuth, async (req: Request<{ id: string }>, res) => {
  const parsed = recommendationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const existing = await Recommendation.findByPk(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Recommendation not found' });
  if (existing.authorId !== req.session.userId) return res.status(403).json({ message: 'You can only edit your own recommendations' });

  await existing.update({
    ...parsed.data,
    url: parsed.data.url || null,
    imageUrl: parsed.data.imageUrl || null,
    note: parsed.data.note || null
  });
  const item = await Recommendation.findByPk(existing.id, {
    include: [
      { model: User, as: 'author', attributes: ['id', 'name'] },
      { model: Like, as: 'likes', attributes: ['userId', 'recommendationId'] },
      { model: Rating, as: 'ratings', attributes: ['userId', 'recommendationId', 'score'] }
    ]
  });
  res.json({ item });
});

app.delete('/recommendations/:id', requireAuth, async (req: Request<{ id: string }>, res) => {
  const result = await Recommendation.destroy({ where: { id: req.params.id, authorId: req.session.userId } });
  if (!result) return res.status(404).json({ message: 'Recommendation not found or not yours to delete' });
  res.json({ ok: true });
});

app.post('/recommendations/:id/like', requireAuth, async (req: Request<{ id: string }>, res) => {
  const userId = req.session.userId!;
  const recommendation = await Recommendation.findByPk(req.params.id);
  if (!recommendation) return res.status(404).json({ message: 'Recommendation not found' });
  const existing = await Like.findOne({ where: { userId, recommendationId: recommendation.id } });
  if (existing) await existing.destroy();
  else await Like.create({ userId, recommendationId: recommendation.id });
  res.json({ ok: true });
});

app.post('/recommendations/:id/rate', requireAuth, async (req: Request<{ id: string }>, res) => {
  const parsed = z.object({ score: z.number().int().min(1).max(5) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payload' });
  const recommendation = await Recommendation.findByPk(req.params.id);
  if (!recommendation) return res.status(404).json({ message: 'Recommendation not found' });
  const [rating, created] = await Rating.findOrCreate({
    where: { userId: req.session.userId!, recommendationId: recommendation.id },
    defaults: { userId: req.session.userId!, recommendationId: recommendation.id, score: parsed.data.score }
  });
  if (!created) await rating.update({ score: parsed.data.score });
  res.json({ ok: true });
});

app.get('/kudos', requireAuth, async (_req, res) => {
  const items = await Kudos.findAll({
    include: [
      { model: User, as: 'from', attributes: ['id', 'name'] },
      { model: User, as: 'to', attributes: ['id', 'name'] }
    ],
    order: [['createdAt', 'DESC']]
  });
  res.json({ items });
});

app.post('/kudos', requireAuth, async (req, res) => {
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

app.get('/celebrations', requireAuth, async (_req, res) => {
  const users = await User.findAll({
    attributes: ['id', 'name', 'birthday', 'joinedOn', 'showBirthday'],
    order: [['name', 'ASC']]
  });
  res.json({
    birthdays: users.filter((user) => user.showBirthday && user.birthday),
    anniversaries: users.filter((user) => user.joinedOn)
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

async function start() {
  await sequelize.authenticate();
  await sequelize.sync();
  app.listen(port, () => console.log(`CO2OPT API running on http://localhost:${port}`));
}

start().catch((error: unknown) => {
  console.error('Unable to start the CO2OPT API with PostgreSQL:', error);
  process.exitCode = 1;
});
