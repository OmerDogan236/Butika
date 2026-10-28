import { boutiqueCategories, boutiques, categories, users } from '@butika/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';
import { ApiError } from '../../lib/errors';

// Kullanıcıların "Paylaş… → Butika" ile eklediği butikler. Eklenen butik isActive=false ve
// kullaniciDurumu='bekliyor' başlar (yalnız ekleyenin Butiklerim'inde); admin onaylayınca vitrine
// çıkar, reddederse ekleyenin listesinden de düşer.
export const adminKullaniciButikleriRoutes = new Hono<AdminContext>();

adminKullaniciButikleriRoutes.use('*', requireAdmin);

adminKullaniciButikleriRoutes.get('/', async (c) => {
  const rows = await db
    .select({
      id: boutiques.id,
      name: boutiques.name,
      description: boutiques.description,
      url: boutiques.url,
      coverImageUrl: boutiques.coverImageUrl,
      instagram: boutiques.instagram,
      countryCode: boutiques.countryCode,
      createdAt: boutiques.createdAt,
      ekleyenAd: users.displayName,
    })
    .from(boutiques)
    .leftJoin(users, eq(boutiques.ekleyenUserId, users.id))
    .where(eq(boutiques.kullaniciDurumu, 'bekliyor'))
    .orderBy(desc(boutiques.createdAt))
    .limit(100);
  const kat = rows.length
    ? await db
        .select({ boutiqueId: boutiqueCategories.boutiqueId, ad: categories.name })
        .from(boutiqueCategories)
        .innerJoin(categories, eq(boutiqueCategories.categoryId, categories.id))
        .where(inArray(boutiqueCategories.boutiqueId, rows.map((r) => r.id)))
    : [];
  return c.json(
    rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      kategoriler: kat.filter((k) => k.boutiqueId === r.id).map((k) => k.ad),
    })),
  );
});

async function durumYaz(id: string, onay: boolean) {
  if (!z.string().uuid().safeParse(id).success) throw ApiError.notFound('boutique not found');
  const [guncel] = await db
    .update(boutiques)
    .set(onay ? { isActive: true, kullaniciDurumu: 'onaylandi' } : { isActive: false, kullaniciDurumu: 'reddedildi' })
    .where(and(eq(boutiques.id, id), eq(boutiques.kullaniciDurumu, 'bekliyor')))
    .returning({ id: boutiques.id });
  if (!guncel) throw ApiError.notFound('pending boutique not found');
}

adminKullaniciButikleriRoutes.post('/:id/onayla', async (c) => {
  await durumYaz(c.req.param('id'), true);
  return c.json({ ok: true });
});

adminKullaniciButikleriRoutes.post('/:id/reddet', async (c) => {
  await durumYaz(c.req.param('id'), false);
  return c.json({ ok: true });
});
