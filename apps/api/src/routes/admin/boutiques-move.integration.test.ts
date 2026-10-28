import { expect, test } from 'bun:test';

// Admin: butiği kategoriler arasında taşı / ekle. Yalnız ayrı yerel butika_notification_test veritabanında.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('butik taşıma ve ekleme', async () => {
  const url = new URL(testUrl!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/butika_notification_test')
  ) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl)
    throw new Error('Database configuration was already loaded; run this test file separately');
  const { db } = await import('../../lib/db');
  const { adminBoutiqueRoutes } = await import('./boutiques');
  const { signAdminAccessToken } = await import('../../lib/jwt');
  const { errorResponse } = await import('../../lib/errors');
  const { Hono } = await import('hono');
  const { asc, eq, inArray } = await import('drizzle-orm');
  const { countries, categories, boutiques, boutiqueCategories } = await import('@butika/db');
  const app = new Hono().route('/admin/boutiques', adminBoutiqueRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const kat = {
    kaynak: crypto.randomUUID(),
    hedef: crypto.randomUUID(),
    yabanci: crypto.randomUUID(),
  };
  const b = {
    tasinan: crypto.randomUUID(),
    hedefteki: crypto.randomUUID(),
    ikisinde: crypto.randomUUID(),
  };
  const token = await signAdminAccessToken(crypto.randomUUID());
  const tasi = (id: string, body: unknown) =>
    app.request(`/admin/boutiques/${id}/move`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const hedefSirasi = async (kategori: string) =>
    (
      await db
        .select({ id: boutiqueCategories.boutiqueId })
        .from(boutiqueCategories)
        .where(eq(boutiqueCategories.categoryId, kategori))
        .orderBy(asc(boutiqueCategories.sortOrder))
    ).map((r) => r.id);

  try {
    await db
      .insert(countries)
      .values([
        { code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' },
        { code: 'US', name: 'United States', defaultLanguage: 'en' },
      ])
      .onConflictDoNothing();
    await db.insert(categories).values([
      { id: kat.kaynak, countryCode: 'TR', slug: `kaynak-${kat.kaynak}`, name: 'Kaynak' },
      { id: kat.hedef, countryCode: 'TR', slug: `hedef-${kat.hedef}`, name: 'Hedef' },
      { id: kat.yabanci, countryCode: 'US', slug: `yabanci-${kat.yabanci}`, name: 'Foreign' },
    ]);
    await db.insert(boutiques).values(
      Object.entries(b).map(([ad, id]) => ({
        id,
        countryCode: 'TR',
        name: ad,
        url: `https://example.com/${id}`,
        coverImageUrl: '',
      })),
    );
    await db.insert(boutiqueCategories).values([
      { boutiqueId: b.tasinan, categoryId: kat.kaynak, sortOrder: 0 },
      { boutiqueId: b.ikisinde, categoryId: kat.kaynak, sortOrder: 1 },
      { boutiqueId: b.hedefteki, categoryId: kat.hedef, sortOrder: 0 },
      { boutiqueId: b.ikisinde, categoryId: kat.hedef, sortOrder: 1 },
    ]);

    // Taşı: kaynaktan çıkar, hedefin en üstüne koy.
    const r1 = await tasi(b.tasinan, {
      fromCategoryId: kat.kaynak,
      toCategoryId: kat.hedef,
      mode: 'tasi',
    });
    expect(await r1.json()).toEqual({ ok: true, eklendi: true, cikarildi: true });
    expect(await hedefSirasi(kat.hedef)).toEqual([b.tasinan, b.hedefteki, b.ikisinde]);
    expect(await hedefSirasi(kat.kaynak)).toEqual([b.ikisinde]);

    // Ekle, hedefte zaten var: hedefteki sırası korunur, kaynakta kalır.
    const r2 = await tasi(b.ikisinde, {
      fromCategoryId: kat.kaynak,
      toCategoryId: kat.hedef,
      mode: 'ekle',
    });
    expect(await r2.json()).toEqual({ ok: true, eklendi: false, cikarildi: false });
    expect(await hedefSirasi(kat.hedef)).toEqual([b.tasinan, b.hedefteki, b.ikisinde]);
    expect(await hedefSirasi(kat.kaynak)).toEqual([b.ikisinde]);

    // Ekle, hedefte yok: iki kategoride birden.
    const r3 = await tasi(b.hedefteki, {
      fromCategoryId: kat.hedef,
      toCategoryId: kat.kaynak,
      mode: 'ekle',
    });
    expect(await r3.json()).toEqual({ ok: true, eklendi: true, cikarildi: false });
    expect(await hedefSirasi(kat.kaynak)).toEqual([b.hedefteki, b.ikisinde]);

    // Hatalar
    expect(
      (await tasi(b.tasinan, { fromCategoryId: kat.hedef, toCategoryId: kat.hedef, mode: 'tasi' }))
        .status,
    ).toBe(400);
    expect(
      (await tasi(b.tasinan, { fromCategoryId: kat.kaynak, toCategoryId: kat.hedef, mode: 'tasi' }))
        .status,
    ).toBe(400); // kaynakta değil
    expect(
      (
        await tasi(b.tasinan, {
          fromCategoryId: kat.hedef,
          toCategoryId: kat.yabanci,
          mode: 'tasi',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await tasi(crypto.randomUUID(), {
          fromCategoryId: kat.hedef,
          toCategoryId: kat.kaynak,
          mode: 'tasi',
        })
      ).status,
    ).toBe(404);
  } finally {
    await db.delete(boutiques).where(inArray(boutiques.id, Object.values(b)));
    await db.delete(categories).where(inArray(categories.id, Object.values(kat)));
  }
});
