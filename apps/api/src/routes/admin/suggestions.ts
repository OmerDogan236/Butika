import { boutiqueSuggestions, boutiques, users } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';
import { ApiError } from '../../lib/errors';

export const adminSuggestionsRoutes = new Hono<AdminContext>();

adminSuggestionsRoutes.use('*', requireAdmin);

const listQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'all']).default('pending'),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

adminSuggestionsRoutes.get('/', zValidator('query', listQuerySchema), async (c) => {
  const { status, cursor, limit } = c.req.valid('query');

  const conds = [];
  if (status !== 'all') conds.push(eq(boutiqueSuggestions.status, status));
  if (cursor) {
    const [cursorRow] = await db
      .select({ createdAt: boutiqueSuggestions.createdAt })
      .from(boutiqueSuggestions)
      .where(eq(boutiqueSuggestions.id, cursor))
      .limit(1);
    if (cursorRow) conds.push(lt(boutiqueSuggestions.createdAt, cursorRow.createdAt));
  }

  const rows = await db
    .select({
      id: boutiqueSuggestions.id,
      name: boutiqueSuggestions.name,
      url: boutiqueSuggestions.url,
      note: boutiqueSuggestions.note,
      status: boutiqueSuggestions.status,
      createdAt: boutiqueSuggestions.createdAt,
      approvedAt: boutiqueSuggestions.approvedAt,
      userId: users.id,
      userName: users.displayName,
      userEmail: users.email,
      approvedBoutiqueId: boutiques.id,
      approvedBoutiqueName: boutiques.name,
    })
    .from(boutiqueSuggestions)
    .innerJoin(users, eq(boutiqueSuggestions.userId, users.id))
    .leftJoin(boutiques, eq(boutiqueSuggestions.boutiqueId, boutiques.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(boutiqueSuggestions.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return c.json({
    items: items.map((r) => ({
      id: r.id,
      name: r.name,
      url: r.url,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      approvedAt: r.approvedAt?.toISOString() ?? null,
      user: { id: r.userId, displayName: r.userName, email: r.userEmail },
      approvedBoutique: r.approvedBoutiqueId
        ? { id: r.approvedBoutiqueId, name: r.approvedBoutiqueName ?? '' }
        : null,
    })),
    nextCursor,
  });
});

adminSuggestionsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [row] = await db
    .select({
      id: boutiqueSuggestions.id,
      name: boutiqueSuggestions.name,
      url: boutiqueSuggestions.url,
      note: boutiqueSuggestions.note,
      status: boutiqueSuggestions.status,
      countryCode: boutiqueSuggestions.countryCode,
      createdAt: boutiqueSuggestions.createdAt,
    })
    .from(boutiqueSuggestions)
    .where(eq(boutiqueSuggestions.id, id))
    .limit(1);
  if (!row) throw ApiError.notFound('suggestion not found');
  return c.json({
    id: row.id,
    name: row.name,
    url: row.url,
    note: row.note,
    status: row.status,
    countryCode: row.countryCode,
    createdAt: row.createdAt.toISOString(),
  });
});

adminSuggestionsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const [existing] = await db
    .select({ id: boutiqueSuggestions.id })
    .from(boutiqueSuggestions)
    .where(eq(boutiqueSuggestions.id, id))
    .limit(1);
  if (!existing) throw ApiError.notFound('suggestion not found');

  await db.delete(boutiqueSuggestions).where(eq(boutiqueSuggestions.id, id));
  return c.json({ ok: true });
});
