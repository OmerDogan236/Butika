import { expect, test } from 'bun:test';

// Detaylı test kaydı, üzerine yazma, kişiye göre kategori sırası ve hesap silme.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('detaylı test ve kategori sırası', async () => {
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
  const { meRoutes } = await import('./me');
  const { categoryRoutes } = await import('./categories');
  const { signAccessToken } = await import('../lib/jwt');
  const { errorResponse } = await import('../lib/errors');
  const { Hono } = await import('hono');
  const { and, eq, inArray } = await import('drizzle-orm');
  const { users, countries, categories, detayliTestCevaplari } = await import('@butika/db');
  const app = new Hono().route('/me', meRoutes).route('/categories', categoryRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const userId = crypto.randomUUID();
  const SLUGLAR = ['gunlukgiyim', 'tesettur', 'kidscorner', 'abiye'] as const;
  const kat = Object.fromEntries(SLUGLAR.map((s) => [s, crypto.randomUUID()])) as Record<
    (typeof SLUGLAR)[number],
    string
  >;
  try {
    await db
      .insert(countries)
      .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
      .onConflictDoNothing();
    const varolan = await db
      .select({ slug: categories.slug })
      .from(categories)
      .where(and(eq(categories.countryCode, 'TR'), inArray(categories.slug, [...SLUGLAR])));
    if (varolan.length > 0)
      throw new Error('Test veritabanında bu slug’lar zaten var; boş bir test veritabanı kullanın');
    await db.insert(categories).values(
      SLUGLAR.map((slug, i) => ({
        id: kat[slug],
        countryCode: 'TR',
        slug,
        name: slug,
        sortOrder: i,
      })),
    );
    await db.insert(users).values({ id: userId, displayName: 'Detaylı test' });
    const token = await signAccessToken(userId);
    const call = (path: string, method = 'GET', body?: unknown) =>
      app.request(path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const bizimSira = async () => {
      const r = (await (await call('/categories?country=TR')).json()) as { id: string }[];
      const bizim = new Set(Object.values(kat));
      return r.filter((k) => bizim.has(k.id)).map((k) => k.id);
    };

    // Test yok → admin sırası, GET null.
    expect(await (await call('/me/detayli-test')).json()).toBeNull();
    expect(await bizimSira()).toEqual(SLUGLAR.map((s) => kat[s]));

    const bos = {
      cocuk: null,
      tesettur: null,
      hamile: null,
      durumlar: [],
      urunler: [],
      bedenler: [],
      buyukBeden: false,
      renkler: [],
      kumas: null,
      degerler: [],
    };
    const ilk = await call('/me/detayli-test', 'PUT', {
      testSurumu: 1,
      cevaplar: {
        ...bos,
        tesettur: 'hayir',
        cocuk: { var: false, yaslar: [], cinsiyet: null },
        urunler: ['abiye'],
      },
    });
    expect(ilk.status).toBe(200);
    expect(await bizimSira()).toEqual([kat.abiye, kat.gunlukgiyim, kat.tesettur, kat.kidscorner]);

    // Geçersiz cevap → 400, kayıt değişmez.
    expect(
      (
        await call('/me/detayli-test', 'PUT', {
          testSurumu: 1,
          cevaplar: { ...bos, tesettur: 'x' },
        })
      ).status,
    ).toBe(400);

    // Üzerine yazma: tek satır kalır, son cevap döner.
    await call('/me/detayli-test', 'PUT', { testSurumu: 1, cevaplar: bos });
    const son = (await (await call('/me/detayli-test')).json()) as {
      cevaplar: { tesettur: string | null };
    };
    expect(son.cevaplar.tesettur).toBeNull();
    expect(
      await db.select().from(detayliTestCevaplari).where(eq(detayliTestCevaplari.userId, userId)),
    ).toHaveLength(1);
    expect(await bizimSira()).toEqual(SLUGLAR.map((s) => kat[s]));

    // Bozuk kayıt (eski sürüm) → GET null, /categories admin sırası, 500 yok.
    await db
      .update(detayliTestCevaplari)
      .set({ cevaplar: { tesettur: 'eski-deger' } })
      .where(eq(detayliTestCevaplari.userId, userId));
    expect(await (await call('/me/detayli-test')).json()).toBeNull();
    expect(await bizimSira()).toEqual(SLUGLAR.map((s) => kat[s]));

    // Hesap kalıcı silinince satır gider.
    await db.delete(users).where(eq(users.id, userId));
    expect(
      await db.select().from(detayliTestCevaplari).where(eq(detayliTestCevaplari.userId, userId)),
    ).toHaveLength(0);
  } finally {
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(categories).where(inArray(categories.id, Object.values(kat)));
  }
});
