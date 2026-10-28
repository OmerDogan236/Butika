import { boutiques, notifications, priceDropEvents, restockEvents, savedProducts, trackedProducts } from '@butika/db';
import { type AppNotification, notificationIdSchema, notificationListSchema } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { and, count, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AuthContext, requireAuth } from '../lib/auth';
import { db } from '../lib/db';
import { ApiError } from '../lib/errors';

export const notificationRoutes = new Hono<AuthContext>();
notificationRoutes.use('*', requireAuth);

notificationRoutes.get('/', zValidator('query', notificationListSchema), async (c) => {
  const userId = c.get('userId');
  const { cursor, limit } = c.req.valid('query');
  // Compare in PostgreSQL to preserve timestamp precision. The cursor must
  // belong to this user, including when it is supplied manually.
  const before = cursor ? sql`(${notifications.createdAt}, ${notifications.id}) < (
    select created_at, id from notifications where id = ${cursor} and user_id = ${userId}
  )` : undefined;
  // A notification is either a price drop or a return to stock of a saved size.
  const productId = sql`coalesce(${priceDropEvents.trackedProductId}, ${restockEvents.trackedProductId})`;
  const rows = await db.select({
    id: notifications.id,
    type: notifications.type,
    eventId: sql<string>`coalesce(${priceDropEvents.id}, ${restockEvents.id})`,
    createdAt: notifications.createdAt,
    readAt: notifications.readAt,
    trackedProductId: trackedProducts.id,
    boutiqueId: boutiques.id,
    boutiqueName: boutiques.name,
    // Each user sees only their own saved title and link: titles are
    // client-supplied, so the shared tracked row must not reach other users.
    productTitle: sql<string | null>`(select ${savedProducts.title} from ${savedProducts}
      where ${savedProducts.userId} = ${notifications.userId} and ${savedProducts.trackedProductId} = ${trackedProducts.id}
      order by ${savedProducts.createdAt} desc limit 1)`,
    sourceUrl: sql<string>`coalesce((select ${savedProducts.url} from ${savedProducts}
      where ${savedProducts.userId} = ${notifications.userId} and ${savedProducts.trackedProductId} = ${trackedProducts.id}
      order by ${savedProducts.createdAt} desc limit 1), ${trackedProducts.sourceUrl})`,
    previousPriceMinor: sql<number | null>`coalesce(${priceDropEvents.previousPriceMinor}, ${restockEvents.previousPriceMinor})`,
    newPriceMinor: sql<number>`coalesce(${priceDropEvents.newPriceMinor}, ${restockEvents.priceMinor})`,
    currency: sql<string>`coalesce(${priceDropEvents.currency}, ${restockEvents.currency})`,
  }).from(notifications)
    .leftJoin(priceDropEvents, eq(notifications.priceDropEventId, priceDropEvents.id))
    .leftJoin(restockEvents, eq(notifications.restockEventId, restockEvents.id))
    .innerJoin(trackedProducts, eq(trackedProducts.id, productId))
    .innerJoin(boutiques, eq(trackedProducts.boutiqueId, boutiques.id))
    .where(and(eq(notifications.userId, userId), before))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit).map((row) => ({
    ...row, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null,
  }) as AppNotification);
  return c.json({ items, nextCursor: rows.length > limit ? items.at(-1)!.id : null });
});

notificationRoutes.get('/unread-count', async (c) => {
  const [row] = await db.select({ count: count() }).from(notifications)
    .where(and(eq(notifications.userId, c.get('userId')), isNull(notifications.readAt)));
  return c.json({ count: row?.count ?? 0 });
});

notificationRoutes.patch('/:id/read', zValidator('param', notificationIdSchema), async (c) => {
  const { id } = c.req.valid('param');
  const [row] = await db.update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, c.get('userId'))))
    .returning({ id: notifications.id, readAt: notifications.readAt });
  if (!row) throw ApiError.notFound('notification not found');
  return c.json({ id: row.id, readAt: row.readAt!.toISOString() });
});

// A push contains the shared event ID (price drop or restock), whereas the
// inbox uses a per-user ID.
notificationRoutes.patch('/events/:id/read', zValidator('param', notificationIdSchema), async (c) => {
  const { id } = c.req.valid('param');
  const [row] = await db.update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(and(or(eq(notifications.priceDropEventId, id), eq(notifications.restockEventId, id)),
      eq(notifications.userId, c.get('userId'))))
    .returning({ id: notifications.id, readAt: notifications.readAt });
  if (!row) throw ApiError.notFound('notification not found');
  return c.json({ id: row.id, readAt: row.readAt!.toISOString() });
});
