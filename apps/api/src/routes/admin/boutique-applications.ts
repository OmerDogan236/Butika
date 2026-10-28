import { boutiqueApplications } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { desc, eq, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';
import { ApiError } from '../../lib/errors';

export const adminBoutiqueApplicationsRoutes = new Hono<AdminContext>();

adminBoutiqueApplicationsRoutes.use('*', requireAdmin);

const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

adminBoutiqueApplicationsRoutes.get('/', zValidator('query', listQuerySchema), async (c) => {
  const { cursor, limit } = c.req.valid('query');

  const conds = [];
  if (cursor) {
    const [cursorRow] = await db
      .select({ createdAt: boutiqueApplications.createdAt })
      .from(boutiqueApplications)
      .where(eq(boutiqueApplications.id, cursor))
      .limit(1);
    if (cursorRow) conds.push(lt(boutiqueApplications.createdAt, cursorRow.createdAt));
  }

  const rows = await db
    .select()
    .from(boutiqueApplications)
    .where(conds.length ? conds[0] : undefined)
    .orderBy(desc(boutiqueApplications.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return c.json({
    items: items.map((r) => ({
      id: r.id,
      boutiqueName: r.boutiqueName,
      city: r.city,
      contactName: r.contactName,
      phone: r.phone,
      email: r.email,
      website: r.website,
      description: r.description,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor,
  });
});

adminBoutiqueApplicationsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const [existing] = await db
    .select({ id: boutiqueApplications.id })
    .from(boutiqueApplications)
    .where(eq(boutiqueApplications.id, id))
    .limit(1);
  if (!existing) throw ApiError.notFound('application not found');

  await db.delete(boutiqueApplications).where(eq(boutiqueApplications.id, id));
  return c.json({ ok: true });
});
