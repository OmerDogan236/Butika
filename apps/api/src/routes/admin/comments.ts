import { boutiques, comments, users } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';
import { ApiError } from '../../lib/errors';

export const adminCommentsRoutes = new Hono<AdminContext>();

adminCommentsRoutes.use('*', requireAdmin);

const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  boutiqueId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

adminCommentsRoutes.get('/', zValidator('query', listQuerySchema), async (c) => {
  const { cursor, boutiqueId, limit } = c.req.valid('query');

  const conds = [isNull(comments.deletedAt)];
  if (boutiqueId) conds.push(eq(comments.boutiqueId, boutiqueId));
  if (cursor) {
    const [cursorRow] = await db
      .select({ createdAt: comments.createdAt })
      .from(comments)
      .where(eq(comments.id, cursor))
      .limit(1);
    if (cursorRow) conds.push(lt(comments.createdAt, cursorRow.createdAt));
  }

  const rows = await db
    .select({
      id: comments.id,
      boutiqueId: comments.boutiqueId,
      url: comments.url,
      body: comments.body,
      createdAt: comments.createdAt,
      userId: users.id,
      userName: users.displayName,
      userEmail: users.email,
      userGender: users.gender,
      userHeight: users.heightCm,
      userWeight: users.weightKg,
      boutiqueName: boutiques.name,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .innerJoin(boutiques, eq(comments.boutiqueId, boutiques.id))
    .where(and(...conds))
    .orderBy(desc(comments.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return c.json({
    items: items.map((r) => ({
      id: r.id,
      url: r.url,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      boutique: { id: r.boutiqueId, name: r.boutiqueName },
      user: {
        id: r.userId,
        displayName: r.userName,
        email: r.userEmail,
        gender: r.userGender,
        heightCm: r.userHeight,
        weightKg: r.userWeight,
      },
    })),
    nextCursor,
  });
});

adminCommentsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const [existing] = await db
    .select({ id: comments.id })
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  if (!existing) throw ApiError.notFound('comment not found');

  await db.update(comments).set({ deletedAt: sql`now()` }).where(eq(comments.id, id));
  return c.json({ ok: true });
});
