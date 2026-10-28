import { expect, test } from 'bun:test';

// Profil okuma/yazma, anlık tetik, gece hesabı ve hesap silme.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın:
// BUTIKA_NOTIFICATION_TEST_URL=postgresql://…/butika_notification_test_profil bun test src/lib/profil/profil-kaydet.integration.test.ts
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('kullanıcı profili veritabanında hesaplanır ve tutulur', async () => {
  const url = new URL(testUrl!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/butika_notification_test')
  ) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  process.env.PROFIL_HESAP_ENABLED = 'true';
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl || !env.PROFIL_HESAP_ENABLED)
    throw new Error('Database configuration was already loaded; run this test file separately');
  const { db } = await import('../db');
  const { profiliYenidenHesapla } = await import('./profil-kaydet');
  const { tumProfilleriHesapla } = await import('./profil-gece');
  const { meRoutes } = await import('../../routes/me');
  const { savedRoutes } = await import('../../routes/saved');
  const { signAccessToken } = await import('../jwt');
  const { errorResponse } = await import('../errors');
  const { Hono } = await import('hono');
  const { eq, inArray } = await import('drizzle-orm');
  const {
    users,
    countries,
    categories,
    boutiques,
    boutiqueCategories,
    savedProducts,
    trackedProducts,
    events,
    tarzTestiCevaplari,
    kullaniciProfilleri,
  } = await import('@butika/db');
  const app = new Hono().route('/me', meRoutes).route('/saved', savedRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const userId = crypto.randomUUID();
  const silinmisId = crypto.randomUUID();
  const olayIdleri: number[] = [];
  const kat = { a: crypto.randomUUID(), b: crypto.randomUUID() };
  const b = {
    bohem: crypto.randomUUID(),
    minimal: crypto.randomUUID(),
    cesur: crypto.randomUUID(),
  };
  const profil = async (id: string) =>
    (await db.select().from(kullaniciProfilleri).where(eq(kullaniciProfilleri.userId, id)))[0];
  const bekle = async (kosul: () => Promise<boolean>) => {
    for (let i = 0; i < 50; i++) {
      if (await kosul()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('arka plan hesabı zamanında bitmedi');
  };

  try {
    await db
      .insert(countries)
      .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
      .onConflictDoNothing();
    await db.insert(categories).values([
      { id: kat.a, countryCode: 'TR', slug: `profil-a-${kat.a}`, name: 'Profil A' },
      { id: kat.b, countryCode: 'TR', slug: `profil-b-${kat.b}`, name: 'Profil B' },
    ]);
    const butik = (id: string, tarz1: string, fiyatSegmenti: string) => ({
      id,
      countryCode: 'TR',
      name: `Profil ${tarz1}`,
      url: `https://example.com/${id}`,
      coverImageUrl: `https://example.com/${id}.jpg`,
      tarz1,
      fiyatSegmenti,
    });
    await db
      .insert(boutiques)
      .values([
        butik(b.bohem, 'bohem', 'orta'),
        butik(b.minimal, 'minimal', 'luks'),
        butik(b.cesur, 'cesur', 'uygun'),
      ]);
    await db.insert(boutiqueCategories).values([
      { boutiqueId: b.bohem, categoryId: kat.a, sortOrder: 0 },
      { boutiqueId: b.minimal, categoryId: kat.b, sortOrder: 0 },
    ]);
    await db.insert(users).values([
      { id: userId, displayName: 'Profil test' },
      { id: silinmisId, displayName: 'Silinmiş', deletedAt: new Date() },
    ]);

    const [takip] = await db
      .insert(trackedProducts)
      .values({
        boutiqueId: b.bohem,
        canonicalUrl: `https://example.com/${b.bohem}/elbise`,
        sourceUrl: `https://example.com/${b.bohem}/elbise`,
        domain: 'example.com',
        currentPriceMinor: 150000,
        currency: 'TRY',
      })
      .returning({ id: trackedProducts.id });
    const urun = (boutiqueId: string, ad: string, ek: Record<string, unknown> = {}) => ({
      userId,
      boutiqueId,
      url: `https://example.com/${boutiqueId}/${ad}`,
      title: ad,
      ...ek,
    });
    const kayitlar = await db
      .insert(savedProducts)
      .values([
        urun(b.bohem, 'elbise', { trackedProductId: takip?.id, urunTuru: 'elbise' }),
        urun(b.bohem, 'bluz', { purchasedAt: new Date() }),
        urun(b.minimal, 'ceket'),
      ])
      .returning({ id: savedProducts.id, url: savedProducts.url });

    const silinenUrl = `https://example.com/${b.cesur}/etek`;
    const olaylar = await db
      .insert(events)
      .values([
        { userId, type: 'boutique_view', payload: { boutiqueId: b.minimal } },
        { userId, type: 'webview_open', payload: { boutiqueId: b.minimal, url: 'x' } },
        { userId, type: 'boutique_view', payload: { boutiqueId: 'bozuk-id' } },
        { userId, type: 'product_saved', payload: { url: silinenUrl, boutique_id: b.cesur } },
        { userId, type: 'product_unsaved', payload: { url: silinenUrl } },
        { userId, type: 'product_unsaved', payload: { url: 'https://bilinmeyen.com/u' } },
      ])
      .returning({ id: events.id });
    olayIdleri.push(...olaylar.map((o) => o.id));

    // Test yok, 3 kayıt: yalnız davranış.
    const p1 = await profiliYenidenHesapla(userId);
    expect(p1.kaynak).toBe('davranis');
    expect(p1.kayitSayisi).toBe(4); // 3 kayıt + 1 satın alma
    expect(Object.keys(p1.tarz).sort()).toEqual(['bohem', 'minimal']); // cesur silmeyle eksi kaldı
    expect(p1.tarz.bohem).toBe(1);
    expect(p1.butce.ortanca).toEqual({ TRY: 150000 });
    expect(p1.butce.segmentler.orta).toBe(1);
    expect(Object.keys(p1.kategoriler).sort()).toEqual([kat.a, kat.b].sort());
    expect(p1.urunEtiketleri.tur).toEqual({ elbise: 1 });
    const satir1 = await profil(userId);
    expect(satir1?.kaynak).toBe('davranis');
    expect(satir1?.tarz).toEqual(p1.tarz);

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

    // Tarz testi gönderimi profili arka planda karışık yapar.
    const test = await call('/me/tarz-testi', 'POST', {
      testSurumu: 1,
      senaryo: {
        kahvalti: ['keten_elbise'],
        davet: ['ucusan_cicekli'],
        ayakkabi: ['espadril_sandalet'],
      },
      acikTarzlar: ['bohem'],
      fiyatSegmentleri: ['orta'],
      renkler: ['pastel'],
    });
    expect(test.status).toBe(201);
    await bekle(async () => (await profil(userId))?.kaynak === 'karisik');

    // Kayıt silme: anlık yeniden hesap, kayıt sayısı düşer.
    const ceket = kayitlar.find((k) => k.url.endsWith('/ceket'));
    expect((await call(`/saved/${ceket?.id}`, 'DELETE')).status).toBe(200);
    await bekle(async () => (await profil(userId))?.kayitSayisi === 3);

    // Gece işi: silinmemiş herkes; silinmeyi bekleyen hesap atlanır.
    const gece = await tumProfilleriHesapla();
    expect(gece.hatali).toBe(0);
    expect(gece.basarili).toBeGreaterThanOrEqual(1);
    expect(await profil(silinmisId)).toBeUndefined();
    expect(
      await db.select().from(tarzTestiCevaplari).where(eq(tarzTestiCevaplari.userId, userId)),
    ).toHaveLength(1);

    // Hesap kalıcı silinince profil de gider.
    await db.delete(users).where(eq(users.id, userId));
    expect(await profil(userId)).toBeUndefined();
  } finally {
    await db.delete(users).where(inArray(users.id, [userId, silinmisId]));
    if (olayIdleri.length > 0) await db.delete(events).where(inArray(events.id, olayIdleri));
    await db.delete(trackedProducts).where(inArray(trackedProducts.boutiqueId, Object.values(b)));
    await db.delete(boutiques).where(inArray(boutiques.id, Object.values(b)));
    await db.delete(categories).where(inArray(categories.id, Object.values(kat)));
  }
});
