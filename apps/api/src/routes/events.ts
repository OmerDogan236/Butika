import { events } from '@butika/db';
import { eventBatchSchema } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { type AuthContext, requireAuth } from '../lib/auth';
import { db } from '../lib/db';

export const eventRoutes = new Hono<AuthContext>();

eventRoutes.use('*', requireAuth);

// POST /events — batch insert. 1-100 olay tek istekte.
eventRoutes.post('/', zValidator('json', eventBatchSchema), async (c) => {
  const userId = c.get('userId');
  const batch = c.req.valid('json');

  const rows = batch.map((e) => ({
    userId,
    type: e.type,
    payload: e.payload as Record<string, unknown>,
  }));

  await db.insert(events).values(rows);

  return c.json({ ok: true, accepted: rows.length });
});
