import { expect, test } from 'bun:test';

// GET /boutiques sıralama: onerilen / kisisel / alfabetik.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('vitrin sıralaması: kisisel ve alfabetik', async () => {
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
  const { eq, inArray } = await import('drizzle-orm');
  const { users, countries, categories, boutiques, boutiqueCategories, tarzTestiCevaplari } =
    await import('@butika/db');
  const app = new Hono().route('/boutiques', boutiqueRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const kullanici = {
    testli: crypto.randomUUID(),
    testsiz: crypto.randomUUID(),
    yasli: crypto.randomUUID(),
  };
  const kat = crypto.randomUUID();
  const b = {
    a: crypto.randomUUID(),
    b: crypto.randomUUID(),
    c: crypto.randomUUID(),
    d: crypto.randomUUID(),
  };
  try {
    await db
      .insert(countries)
      .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
      .onConflictDoNothing();
    await db
      .insert(categories)
      .values({ id: kat, countryCode: 'TR', slug: `sirala-${kat}`, name: 'Sırala' });
    const butik = (id: string, name: string, ek: Record<string, unknown> = {}) => ({
      id,
      countryCode: 'TR',
      name,
      url: `https://example.com/${id}`,
      coverImageUrl: `https://example.com/${id}.jpg`,
      ...ek,
    });
    await db
      .insert(boutiques)
      .values([
        butik(b.a, 'Zeytin', { tarz1: 'bohem', fiyatSegmenti: 'luks' }),
        butik(b.b, 'Badem'),
        butik(b.c, 'Nar', { tarz1: 'minimal', fiyatSegmenti: 'orta' }),
        butik(b.d, 'Ayva', { tarz1: 'minimal', fiyatSegmenti: 'luks' }),
      ]);
    await db.insert(boutiqueCategories).values([
      { boutiqueId: b.a, categoryId: kat, sortOrder: 0 },
      { boutiqueId: b.b, categoryId: kat, sortOrder: 1 },
      { boutiqueId: b.c, categoryId: kat, sortOrder: 2 },
      { boutiqueId: b.d, categoryId: kat, sortOrder: 3 },
    ]);
    await db.insert(users).values([
      { id: kullanici.testli, displayName: 'Testli' },
      { id: kullanici.testsiz, displayName: 'Testsiz' },
    ]);
    await db.insert(tarzTestiCevaplari).values({
      userId: kullanici.testli,
      testSurumu: 2,
      senaryoCevaplari: {},
      acikTarzlar: ['minimal'],
      fiyatSegmentleri: ['orta'],
      renkler: [],
      esnek: false,
    });

    const liste = async (userId: string, sort?: string) => {
      const token = await signAccessToken(userId);
      const q = `categoryId=${kat}${sort ? `&sort=${sort}` : ''}`;
      const res = await app.request(`/boutiques?${q}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      return (await res.json()) as Record<string, unknown>[];
    };
    const idler = (rows: Record<string, unknown>[]) => rows.map((r) => r.id);

    expect(idler(await liste(kullanici.testli, 'kisisel'))).toEqual([b.c, b.d, b.a, b.b]);
    expect(idler(await liste(kullanici.testsiz, 'kisisel'))).toEqual([b.a, b.b, b.c, b.d]);
    expect(idler(await liste(kullanici.testli))).toEqual([b.a, b.b, b.c, b.d]);
    expect(idler(await liste(kullanici.testli, 'alfabetik'))).toEqual([b.d, b.b, b.c, b.a]);

    // Seçkideki butik: testli kullanıcıda sona iner, testsizde admin sırası değişmez
    await db.update(boutiques).set({ editorSecimi: true }).where(eq(boutiques.id, b.c));
    expect(idler(await liste(kullanici.testli, 'kisisel'))).toEqual([b.d, b.a, b.b, b.c]);
    expect(idler(await liste(kullanici.testsiz, 'kisisel'))).toEqual([b.a, b.b, b.c, b.d]);
    await db.update(boutiques).set({ editorSecimi: false }).where(eq(boutiques.id, b.c));

    // Yaş: aynı tarzdaki butikler arasında hedef yaşı uyan öne geçer; hiçbiri kaybolmaz.
    await db
      .update(boutiques)
      .set({ tarz1: 'minimal', fiyatSegmenti: 'orta' })
      .where(inArray(boutiques.id, [b.a, b.b]));
    await db
      .update(boutiques)
      .set({ hedefYaslar: ['18_24'] })
      .where(eq(boutiques.id, b.c));
    await db
      .update(boutiques)
      .set({ hedefYaslar: ['55_plus'] })
      .where(eq(boutiques.id, b.d));
    const yasli = kullanici.yasli;
    await db.insert(users).values({ id: yasli, displayName: 'Yaşlı' });
    await db.insert(tarzTestiCevaplari).values({
      userId: yasli,
      testSurumu: 2,
      senaryoCevaplari: {},
      acikTarzlar: ['minimal'],
      fiyatSegmentleri: ['orta'],
      renkler: [],
      yasAraligi: '55_plus',
      esnek: false,
    });
    const yasSirali = idler(await liste(yasli, 'kisisel'));
    expect(yasSirali).toHaveLength(4);
    expect(yasSirali.indexOf(b.d)).toBeLessThan(yasSirali.indexOf(b.c));
    for (const r of await liste(yasli, 'kisisel')) expect('hedefYaslar' in r).toBe(false);

    const satirlar = await liste(kullanici.testli, 'kisisel');
    for (const r of satirlar) {
      for (const alan of ['tarz1', 'tarz2', 'fiyatSegmenti', 'temsiliFiyatTl', 'hedefYaslar'])
        expect(alan in r).toBe(false);
    }
  } finally {
    await db.delete(users).where(inArray(users.id, Object.values(kullanici)));
    await db.delete(boutiques).where(inArray(boutiques.id, Object.values(b)));
    await db.delete(categories).where(eq(categories.id, kat));
  }
});
