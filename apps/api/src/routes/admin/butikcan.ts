import { butikcanQueries } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { avg, count, desc, gte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';

export const adminButikcanRoutes = new Hono<AdminContext>();

adminButikcanRoutes.use('*', requireAdmin);

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

adminButikcanRoutes.get('/', zValidator('query', querySchema), async (c) => {
  const { range, limit } = c.req.valid('query');
  const since = new Date(Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);

  const [recent, topQueries, dailyTrend, totalRow] = await Promise.all([
    db
      .select({
        query: butikcanQueries.query,
        turnCount: butikcanQueries.turnCount,
        market: butikcanQueries.market,
        boutiqueCount: butikcanQueries.boutiqueCount,
        createdAt: butikcanQueries.createdAt,
      })
      .from(butikcanQueries)
      .where(gte(butikcanQueries.createdAt, since))
      .orderBy(desc(butikcanQueries.createdAt))
      .limit(limit),

    db
      .select({
        query: butikcanQueries.query,
        count: count().as('count'),
        noResults:
          sql<number>`sum(case when ${butikcanQueries.boutiqueCount} = 0 then 1 else 0 end)`.as(
            'no_results',
          ),
        lastAt: sql<Date>`max(${butikcanQueries.createdAt})`.as('last_at'),
      })
      .from(butikcanQueries)
      .where(gte(butikcanQueries.createdAt, since))
      .groupBy(butikcanQueries.query)
      .orderBy(desc(count()))
      .limit(limit),

    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${butikcanQueries.createdAt}), 'YYYY-MM-DD')`.as(
          'day',
        ),
        total: count().as('total'),
        avgTurns: avg(butikcanQueries.turnCount).as('avg_turns'),
      })
      .from(butikcanQueries)
      .where(gte(butikcanQueries.createdAt, since))
      .groupBy(sql`date_trunc('day', ${butikcanQueries.createdAt})`)
      .orderBy(sql`date_trunc('day', ${butikcanQueries.createdAt})`),

    db.select({ n: count() }).from(butikcanQueries).where(gte(butikcanQueries.createdAt, since)),
  ]);

  return c.json({
    range,
    total: Number(totalRow[0]?.n ?? 0),
    trend: dailyTrend.map((d) => ({
      day: d.day,
      total: Number(d.total ?? 0),
      avgTurns: d.avgTurns ? Number(d.avgTurns) : 0,
    })),
    topQueries: topQueries.map((q) => ({
      query: q.query,
      count: Number(q.count ?? 0),
      noResults: Number(q.noResults ?? 0),
      lastAt: q.lastAt ? new Date(q.lastAt).toISOString() : null,
    })),
    recent: recent.map((r) => ({
      query: r.query,
      turnCount: r.turnCount,
      market: r.market,
      boutiqueCount: r.boutiqueCount,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});
