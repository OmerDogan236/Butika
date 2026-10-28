import { boutiques, categories, countries } from '@butika/db';
import { codeToFlag, countryCreateSchema, countryUpdateSchema } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { asc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import { invalidateMarketCache } from '../../lib/market';
import { isUniqueViolation } from '../../lib/pg-errors';

export const adminCountryRoutes = new Hono<AdminContext>();

adminCountryRoutes.use('*', requireAdmin);

// Tüm pazarlar (pasif dahil) + içerik sayıları — yönetim ekranı için.
adminCountryRoutes.get('/', async (c) => {
  const [rows, bCounts, cCounts] = await Promise.all([
    db.select().from(countries).orderBy(asc(countries.sortOrder), asc(countries.code)),
    db
      .select({ code: boutiques.countryCode, n: sql<number>`count(*)` })
      .from(boutiques)
      .groupBy(boutiques.countryCode),
    db
      .select({ code: categories.countryCode, n: sql<number>`count(*)` })
      .from(categories)
      .groupBy(categories.countryCode),
  ]);
  const bMap = new Map(bCounts.map((r) => [r.code, Number(r.n)]));
  const cMap = new Map(cCounts.map((r) => [r.code, Number(r.n)]));
  return c.json(
    rows.map((r) => ({
      code: r.code,
      name: r.name,
      flag: codeToFlag(r.code),
      defaultLanguage: r.defaultLanguage,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      boutiqueCount: bMap.get(r.code) ?? 0,
      categoryCount: cMap.get(r.code) ?? 0,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

// Yeni pazar (admin'de bayrağa tıklayınca).
adminCountryRoutes.post('/', zValidator('json', countryCreateSchema), async (c) => {
  const body = c.req.valid('json');
  const sortOrder = await nextSortOrder();
  try {
    const [created] = await db
      .insert(countries)
      .values({
        code: body.code,
        name: body.name,
        defaultLanguage: body.defaultLanguage,
        sortOrder,
      })
      .returning();
    invalidateMarketCache();
    return c.json(created, 201);
  } catch (err) {
    if (isUniqueViolation(err)) throw ApiError.conflict('country_exists', 'Bu ülke zaten ekli');
    throw err;
  }
});

adminCountryRoutes.patch('/:code', zValidator('json', countryUpdateSchema), async (c) => {
  const code = c.req.param('code').toUpperCase();
  const body = c.req.valid('json');
  if (Object.keys(body).length === 0) {
    const [row] = await db.select().from(countries).where(eq(countries.code, code)).limit(1);
    if (!row) throw ApiError.notFound('country not found');
    return c.json(row);
  }
  const [updated] = await db
    .update(countries)
    .set(body)
    .where(eq(countries.code, code))
    .returning();
  if (!updated) throw ApiError.notFound('country not found');
  invalidateMarketCache();
  return c.json(updated);
});

const reorderSchema = z.object({
  items: z
    .array(z.object({ id: z.string(), sortOrder: z.number().int() }))
    .min(1)
    .max(500),
});

adminCountryRoutes.post('/reorder', zValidator('json', reorderSchema), async (c) => {
  const { items } = c.req.valid('json');
  await db.transaction(async (tx) => {
    for (const it of items) {
      await tx
        .update(countries)
        .set({ sortOrder: it.sortOrder })
        .where(eq(countries.code, it.id.toUpperCase()));
    }
  });
  invalidateMarketCache();
  return c.json({ ok: true, updated: items.length });
});

adminCountryRoutes.delete('/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const [b] = await db
    .select({ id: boutiques.id })
    .from(boutiques)
    .where(eq(boutiques.countryCode, code))
    .limit(1);
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.countryCode, code))
    .limit(1);
  if (b || cat)
    throw ApiError.conflict('country_in_use', 'Bu ülkede butik/kategori var; önce taşı ya da sil');
  const [deleted] = await db.delete(countries).where(eq(countries.code, code)).returning();
  if (!deleted) throw ApiError.notFound('country not found');
  invalidateMarketCache();
  return c.json({ ok: true });
});

async function nextSortOrder(): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${countries.sortOrder}), -1)` })
    .from(countries);
  return Number(row?.max ?? -1) + 1;
}
