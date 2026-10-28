import { expect, test } from 'bun:test';

// Tarz testi kaydı, öneriler, gösterim tekrarı ve hesap silme.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('tarz testi ve öneriler', async () => {
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
    savedProducts,
    events,
    tarzTestiCevaplari,
  } = await import('@butika/db');
  const app = new Hono().route('/me', meRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const userId = crypto.randomUUID();
  const kat = { a: crypto.randomUUID(), b: crypto.randomUUID() };
  const b = {
    bohem1: crypto.randomUUID(),
    bohem2: crypto.randomUUID(),
    sokak: crypto.randomUUID(),
    favori: crypto.randomUUID(),
    pasif: crypto.randomUUID(),
  };
  try {
    await db
      .insert(countries)
      .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
      .onConflictDoNothing();
    await db.insert(categories).values([
      { id: kat.a, countryCode: 'TR', slug: `test-a-${kat.a}`, name: 'Test A' },
      { id: kat.b, countryCode: 'TR', slug: `test-b-${kat.b}`, name: 'Test B' },
    ]);
    const butik = (id: string, name: string, tarz1: string, ek: Record<string, unknown> = {}) => ({
      id,
      countryCode: 'TR',
      name,
      url: `https://example.com/${id}`,
      coverImageUrl: `https://example.com/${id}.jpg`,
      tarz1,
      ...ek,
    });
    await db
      .insert(boutiques)
      .values([
        butik(b.bohem1, 'Bohem Bir', 'bohem', { fiyatSegmenti: 'orta' }),
        butik(b.bohem2, 'Bohem İki', 'bohem', { fiyatSegmenti: 'luks' }),
        butik(b.sokak, 'Sokak', 'sokak'),
        butik(b.favori, 'Favori', 'bohem'),
        butik(b.pasif, 'Pasif', 'bohem', { isActive: false }),
      ]);
    await db.insert(boutiqueCategories).values([
      { boutiqueId: b.bohem1, categoryId: kat.a, sortOrder: 0 },
      { boutiqueId: b.sokak, categoryId: kat.b, sortOrder: 0 },
      { boutiqueId: b.favori, categoryId: kat.a, sortOrder: 1 },
    ]);
    await db.insert(users).values({ id: userId, displayName: 'Tarz test' });
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
    type Oneriler = { oneriId: string | null; items: { id: string }[] };

    // Test ve favori yok: yalnız telefonun gönderdiği onboarding kategorisinden.
    const onboarding = (await (
      await call(`/me/oneriler?country=TR&kategoriler=${kat.b}`)
    ).json()) as Oneriler;
    expect(onboarding.items.map((i) => i.id)).toEqual([b.sokak]);

    expect(await (await call('/me/tarz-testi')).json()).toBeNull();

    const cevap = {
      testSurumu: 1,
      senaryo: {
        kahvalti: ['keten_elbise'],
        davet: ['ucusan_cicekli'],
        ayakkabi: ['espadril_sandalet'],
      },
      acikTarzlar: ['bohem'],
      fiyatSegmentleri: ['orta'],
      renkler: ['pastel'],
    };
    const kayit = await call('/me/tarz-testi', 'POST', cevap);
    expect(kayit.status).toBe(201);
    expect(((await kayit.json()) as { tarz1: string }).tarz1).toBe('bohem');
    expect(
      (
        await call('/me/tarz-testi', 'POST', {
          ...cevap,
          senaryo: { ...cevap.senaryo, davet: ['hepsi'] },
        })
      ).status,
    ).toBe(400);

    // Yenileme yeni satır ekler; GET en sonuncuyu döner.
    await call('/me/tarz-testi', 'POST', { ...cevap, acikTarzlar: ['romantik'] });
    const son = (await (await call('/me/tarz-testi')).json()) as { acikTarzlar: string[] };
    expect(son.acikTarzlar).toEqual(['romantik']);
    expect(
      await db.select().from(tarzTestiCevaplari).where(eq(tarzTestiCevaplari.userId, userId)),
    ).toHaveLength(2);

    const ozet = (await (await call('/me/profil-ozet')).json()) as {
      tarz: { test: { birincil: string } | null };
    };
    expect(ozet.tarz.test?.birincil).toBe('romantik');

    await db.insert(savedProducts).values({
      userId,
      boutiqueId: b.favori,
      url: 'https://example.com/favori/urun',
      title: 'Ürün',
    });

    const ilk = (await (await call('/me/oneriler?country=TR')).json()) as Oneriler;
    const idler = ilk.items.map((i) => i.id);
    expect(idler[0]).toBe(b.bohem1); // tarz + fiyat tam + favori kategorisi
    expect(idler).toContain(b.bohem2);
    expect(idler).not.toContain(b.favori);
    expect(idler).not.toContain(b.pasif);

    const tekrar = (await (await call('/me/oneriler?country=TR')).json()) as Oneriler;
    expect(tekrar.oneriId).toBe(ilk.oneriId);
    const gosterimler = await db
      .select()
      .from(events)
      .where(and(eq(events.userId, userId), eq(events.type, 'oneri_gosterildi')));
    expect(gosterimler).toHaveLength(2); // onboarding listesi + ilk liste; tekrar yazılmadı

    // Hesap kalıcı silinince cevaplar da gider.
    await db.delete(users).where(eq(users.id, userId));
    expect(
      await db.select().from(tarzTestiCevaplari).where(eq(tarzTestiCevaplari.userId, userId)),
    ).toHaveLength(0);
  } finally {
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(boutiques).where(inArray(boutiques.id, Object.values(b)));
    await db.delete(categories).where(inArray(categories.id, Object.values(kat)));
  }
});
