import { countries, vitrinAyarlari } from '@butika/db';
import { type AdminVitrinAyari, vitrinAyarlariGuncelleSchema } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { asc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';
import { ApiError } from '../../lib/errors';

export const adminVitrinAyarlariRoutes = new Hono<AdminContext>();

adminVitrinAyarlariRoutes.use('*', requireAdmin);

function serialize(
  countryCode: string,
  row: typeof vitrinAyarlari.$inferSelect | null | undefined,
): AdminVitrinAyari {
  return {
    countryCode,
    seckiBasligi: row?.seckiBasligi ?? null,
    guncelSurumIos: row?.guncelSurumIos ?? null,
    guncelSurumAndroid: row?.guncelSurumAndroid ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

// Tüm pazarlar (pasif dahil, pazar sırasıyla); kaydı olmayan pazarın alanları null.
adminVitrinAyarlariRoutes.get('/', async (c) => {
  const [pazarlar, satirlar] = await Promise.all([
    db
      .select({ code: countries.code })
      .from(countries)
      .orderBy(asc(countries.sortOrder), asc(countries.code)),
    db.select().from(vitrinAyarlari),
  ]);
  const byCode = new Map(satirlar.map((r) => [r.countryCode, r]));
  return c.json(pazarlar.map((p) => serialize(p.code, byCode.get(p.code))));
});

// Pazarın ayarını yazar (kayıt yoksa açar). Verilmeyen alan değişmez; boş metin → null.
adminVitrinAyarlariRoutes.patch(
  '/:country',
  zValidator('json', vitrinAyarlariGuncelleSchema),
  async (c) => {
    const code = c.req.param('country').toUpperCase();
    const body = c.req.valid('json');
    const [pazar] = await db
      .select({ code: countries.code })
      .from(countries)
      .where(eq(countries.code, code))
      .limit(1);
    if (!pazar) throw ApiError.notFound('country not found');

    const [row] = await db
      .insert(vitrinAyarlari)
      .values({ countryCode: code, ...body })
      .onConflictDoUpdate({
        target: vitrinAyarlari.countryCode,
        set: { ...body, updatedAt: sql`now()` },
      })
      .returning();
    return c.json(serialize(code, row));
  },
);
