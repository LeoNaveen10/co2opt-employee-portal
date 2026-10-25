import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/session';
import { User, Recommendation, Like, Rating } from '../../models';
import { recommendationSchema } from './schema';

const router = Router();

router.get('/recommendations', requireAuth, async (_req, res) => {
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

router.get('/recommendations/search', requireAuth, async (req, res) => {
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

router.post('/recommendations', requireAuth, async (req, res) => {
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

router.patch('/recommendations/:id', requireAuth, async (req: Request<{ id: string }>, res) => {
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

router.delete('/recommendations/:id', requireAuth, async (req: Request<{ id: string }>, res) => {
  const result = await Recommendation.destroy({ where: { id: req.params.id, authorId: req.session.userId } });
  if (!result) return res.status(404).json({ message: 'Recommendation not found or not yours to delete' });
  res.json({ ok: true });
});

router.post('/recommendations/:id/like', requireAuth, async (req: Request<{ id: string }>, res) => {
  const userId = req.session.userId!;
  const recommendation = await Recommendation.findByPk(req.params.id);
  if (!recommendation) return res.status(404).json({ message: 'Recommendation not found' });
  const existing = await Like.findOne({ where: { userId, recommendationId: recommendation.id } });
  if (existing) await existing.destroy();
  else await Like.create({ userId, recommendationId: recommendation.id });
  res.json({ ok: true });
});

router.post('/recommendations/:id/rate', requireAuth, async (req: Request<{ id: string }>, res) => {
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

export default router;
