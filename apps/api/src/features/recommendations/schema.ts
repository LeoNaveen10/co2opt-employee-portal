import { z } from 'zod';

export const recommendationSchema = z.object({
  type: z.enum(['MOVIE', 'SERIES', 'BOOK', 'MUSIC']),
  title: z.string().trim().min(1),
  url: z.string().optional().nullable(),
  imageUrl: z.string().url().refine((value) => value.startsWith('https://'), 'Artwork URL must use HTTPS').or(z.literal('')).optional().nullable(),
  note: z.string().max(300).optional().nullable()
});
