import { Router } from 'express';

export function createHealthRouter(checkDatabase: () => Promise<unknown>) {
  const router = Router();

  router.get('/health', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await checkDatabase();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false, message: 'Database unavailable' });
    }
  });

  return router;
}
