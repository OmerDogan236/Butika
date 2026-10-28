import { searchQueries } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { count, desc, gte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';

export const adminSearchesRoutes = new Hono<AdminContext>();

adminSearchesRoutes.use('*', requireAdmin);

const querySchema = z.object({
  range: z.enum(['1d', '7d', '30d', '90d']).default('7d'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const RANGE_DAYS: Record<'1d' | '7d' | '30d' | '90d', number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

adminSearchesRoutes.get('/', zValidator('query', querySchema), async (c) => {
  const { range, limit } = c.req.valid('query');
  const since = new Date(Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);

  const [topQueries, dailyTrend, totalRow] = await Promise.all([
    db
      .select({
        query: searchQueries.query,
        count: count().as('count'),
        zeroResults:
          sql<number>`sum(case when ${searchQueries.resultCount} = 0 then 1 else 0 end)`.as(
            'zero_results',
          ),
        lastAt: sql<Date>`max(${searchQueries.createdAt})`.as('last_at'),
      })
      .from(searchQueries)
      .where(gte(searchQueries.createdAt, since))
      .groupBy(searchQueries.query)
      .orderBy(desc(count()))
      .limit(limit),

    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${searchQueries.createdAt}), 'YYYY-MM-DD')`.as(
          'day',
        ),
        total: count().as('total'),
        unique: sql<number>`count(distinct ${searchQueries.query})`.as('unique'),
      })
      .from(searchQueries)
      .where(gte(searchQueries.createdAt, since))
      .groupBy(sql`date_trunc('day', ${searchQueries.createdAt})`)
      .orderBy(sql`date_trunc('day', ${searchQueries.createdAt})`),

    db.select({ n: count() }).from(searchQueries).where(gte(searchQueries.createdAt, since)),
  ]);

  return c.json({
    range,
    total: Number(totalRow[0]?.n ?? 0),
    trend: dailyTrend.map((d) => ({
      day: d.day,
      total: Number(d.total ?? 0),
      unique: Number(d.unique ?? 0),
    })),
    topQueries: topQueries.map((q) => ({
      query: q.query,
      count: Number(q.count ?? 0),
      zeroResults: Number(q.zeroResults ?? 0),
      lastAt: q.lastAt ? new Date(q.lastAt).toISOString() : null,
    })),
  });
});
