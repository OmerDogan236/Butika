import { events, users } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';

export const adminEventsRoutes = new Hono<AdminContext>();

adminEventsRoutes.use('*', requireAdmin);

const querySchema = z.object({
  cursor: z.coerce.number().int().optional(),
  type: z
    .enum([
      'app_open',
      'boutique_view',
      'webview_open',
      'product_saved',
      'product_unsaved',
      'product_open',
      'search',
      'share',
    ])
    .optional(),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

adminEventsRoutes.get('/', zValidator('query', querySchema), async (c) => {
  const { cursor, type, userId, limit } = c.req.valid('query');

  const conditions = [];
  if (cursor !== undefined) conditions.push(lt(events.id, cursor));
  if (type) conditions.push(eq(events.type, type));
  if (userId) conditions.push(eq(events.userId, userId));

  const rows = await db
    .select({
      id: events.id,
      type: events.type,
      payload: events.payload,
      createdAt: events.createdAt,
      userId: events.userId,
      userDisplayName: users.displayName,
      userEmail: users.email,
    })
    .from(events)
    .leftJoin(users, eq(events.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(events.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return c.json({
    items: items.map((r) => ({
      id: String(r.id),
      type: r.type,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
      user: r.userId
        ? { id: r.userId, displayName: r.userDisplayName ?? '—', email: r.userEmail ?? null }
        : null,
    })),
    nextCursor: nextCursor ? String(nextCursor) : null,
  });
});
