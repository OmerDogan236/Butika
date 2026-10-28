import { expect, test } from 'bun:test';

// Vitrin "Sana özel": detaylı testin kategori puanı, listelenen kategoriyi saymaz.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('detaylı test: listelenen kategori puana girmez', async () => {
  const url = new URL(testUrl!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/butika_notification_test')
  ) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../env');
  if (env.DATABASE_URL !== testUrl)
    throw new Error('Database configuration was already loaded; run this test file separately');
  const { db } = await import('../lib/db');
  const { boutiqueRoutes } = await import('./boutiques');
  const { signAccessToken } = await import('../lib/jwt');
  const { errorResponse } = await import('../lib/errors');
  const { Hono } = await import('hono');
  const { and, eq, inArray } = await import('drizzle-orm');
  const {
    users,
    countries,
    categories,
    boutiques,
    boutiqueCategories,
    tarzTestiCevaplari,
    detayliTestCevaplari,
  } = await import('@butika/db');
  const { BOS_DETAYLI_CEVAP } = await import('@butika/types');
  const app = new Hono().route('/boutiques', boutiqueRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const userId = crypto.randomUUID();
  const gunluk = crypto.randomUUID();
  const tesettur = crypto.randomUUID();
  const b = { a: crypto.randomUUID(), b: crypto.randomUUID() };
  try {
    await db
      .insert(countries)
      .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
      .onConflictDoNothing();
    const varolan = await db
      .select({ slug: categories.slug })
      .from(categories)
      .where(
        and(
          eq(categories.countryCode, 'TR'),
          inArray(categories.slug, ['gunlukgiyim', 'tesettur']),
        ),
      );
    if (varolan.length > 0)
      throw new Error('Test veritabanında bu slug’lar zaten var; boş bir test veritabanı kullanın');
    await db.insert(categories).values([
      { id: gunluk, countryCode: 'TR', slug: 'gunlukgiyim', name: 'Günlük', sortOrder: 0 },
      { id: tesettur, countryCode: 'TR', slug: 'tesettur', name: 'Tesettür', sortOrder: 1 },
    ]);
    const butik = (id: string, name: string) => ({
      id,
      countryCode: 'TR',
      name,
      url: `https://example.com/${id}`,
      coverImageUrl: `https://example.com/${id}.jpg`,
      tarz1: 'minimal',
      fiyatSegmenti: 'orta',
    });
    // a: yalnız günlük giyim (admin sırasında önde); b: aynı özellikler, ayrıca tesettür.
    await db.insert(boutiques).values([butik(b.a, 'Zeytin'), butik(b.b, 'Badem')]);
    await db.insert(boutiqueCategories).values([
      { boutiqueId: b.a, categoryId: gunluk, sortOrder: 0 },
      { boutiqueId: b.b, categoryId: gunluk, sortOrder: 1 },
      { boutiqueId: b.b, categoryId: tesettur, sortOrder: 0 },
    ]);
    await db.insert(users).values({ id: userId, displayName: 'Detaylı sıralama' });
    await db.insert(tarzTestiCevaplari).values({
      userId,
      testSurumu: 2,
      senaryoCevaplari: {},
      acikTarzlar: ['minimal'],
      fiyatSegmentleri: ['orta'],
      renkler: [],
      esnek: false,
    });
    await db.insert(detayliTestCevaplari).values({
      userId,
      testSurumu: 1,
      cevaplar: { ...BOS_DETAYLI_CEVAP, urunler: ['giyim'], tesettur: 'evet' },
    });

    const token = await signAccessToken(userId);
    const liste = async (categoryId: string) => {
      const res = await app.request(`/boutiques?categoryId=${categoryId}&sort=kisisel`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      return ((await res.json()) as { id: string }[]).map((r) => r.id);
    };

    // Günlük giyim listesinde herkes zaten günlük giyimde: yalnız tesettür farkı sayılır.
    expect(await liste(gunluk)).toEqual([b.b, b.a]);
    // Tesettür listesinde yalnız b var.
    expect(await liste(tesettur)).toEqual([b.b]);
  } finally {
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(boutiques).where(inArray(boutiques.id, Object.values(b)));
    await db.delete(categories).where(inArray(categories.id, [gunluk, tesettur]));
  }
});
