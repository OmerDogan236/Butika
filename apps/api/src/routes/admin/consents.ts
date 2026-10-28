import { consentRecords } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';

export const adminConsentsRoutes = new Hono<AdminContext>();

adminConsentsRoutes.use('*', requireAdmin);

const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
});

adminConsentsRoutes.get('/', zValidator('query', listQuerySchema), async (c) => {
  const { cursor, limit } = c.req.valid('query');

  const conds = [];
  if (cursor) {
    const [cursorRow] = await db
      .select({ createdAt: consentRecords.createdAt })
      .from(consentRecords)
      .where(eq(consentRecords.id, cursor))
      .limit(1);
    if (cursorRow) conds.push(lt(consentRecords.createdAt, cursorRow.createdAt));
  }

  const rows = await db
    .select()
    .from(consentRecords)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(consentRecords.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return c.json({
    items: items.map((r) => ({
      id: r.id,
      email: r.email,
      userId: r.userId,
      visitorId: r.visitorId,
      consentType: r.consentType,
      granted: r.granted,
      textVersion: r.textVersion,
      source: r.source,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      locale: r.locale,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor,
  });
});
