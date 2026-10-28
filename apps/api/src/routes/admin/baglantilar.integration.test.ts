import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';

// Admin: butik davet linki ve bağlantı listesi.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;
// Shopify uygulama anahtarı şifreli saklanır; testte rastgele şifreleme anahtarı.
process.env.BAGLANTI_SIFRELEME_ANAHTARI ??= randomBytes(32).toString('base64');

test.skipIf(!testUrl)('admin bağlantılar: davet, liste, kapatma, iade politikası', async () => {
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
  const { adminBaglantilarRoutes } = await import('./baglantilar');
  const { signAdminAccessToken, signAccessToken } = await import('../../lib/jwt');
  const { errorResponse } = await import('../../lib/errors');
  const { Hono } = await import('hono');
  const { eq } = await import('drizzle-orm');
  const {
    boutiques,
    baglantiDavetleri,
    butikBaglantilari,
    baglantiUrunleri,
    gonderimler,
    butikSiparisleri,
    users,
    countries,
  } = await import('@butika/db');
  const app = new Hono().route('/admin/baglantilar', adminBaglantilarRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const butikId = crypto.randomUUID();
  const kullanici = crypto.randomUUID();
  const baglantiId = crypto.randomUUID();
  const tag = butikId.slice(0, 8);
  try {
    await db
      .insert(countries)
      .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
      .onConflictDoNothing();
    await db.insert(boutiques).values({
      id: butikId,
      countryCode: 'TR',
      name: 'Bağlı Butik',
      url: `https://example.com/${butikId}`,
      coverImageUrl: 'https://example.com/c.jpg',
    });
    await db.insert(users).values({ id: kullanici, displayName: 'Alıcı' });

    const adminToken = await signAdminAccessToken(crypto.randomUUID());
    const istek = (
      yol: string,
      method = 'GET',
      body?: unknown,
      token: string | null = adminToken,
    ) =>
      app.request(`/admin/baglantilar${yol}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    // Yetki: token yok, kullanıcı token'ı
    expect((await istek('/davet', 'POST', { boutiqueId: butikId }, null)).status).toBe(401);
    expect(
      (await istek('/davet', 'POST', { boutiqueId: butikId }, await signAccessToken(kullanici)))
        .status,
    ).toBe(401);
    expect((await istek('')).status).toBe(200);
    expect((await istek('', 'GET', undefined, null)).status).toBe(401);

    // Davet
    const d1 = await istek('/davet', 'POST', { boutiqueId: butikId });
    expect(d1.status).toBe(201);
    const davet1 = (await d1.json()) as { token: string; link: string };
    expect(davet1.link).toBe(`${env.KATILIM_SAYFASI_URL}?davet=${davet1.token}`);
    expect(davet1.link).toContain('?davet=');
    expect(davet1.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [kayit] = await db
      .select()
      .from(baglantiDavetleri)
      .where(eq(baglantiDavetleri.token, davet1.token));
    expect(kayit?.boutiqueId).toBe(butikId);
    expect(kayit?.iptalAt).toBeNull();
    expect(kayit?.olusturan).toBeTruthy();

    // İkinci davet ilkini iptal eder
    const davet2 = (await (await istek('/davet', 'POST', { boutiqueId: butikId })).json()) as {
      token: string;
    };
    expect(davet2.token).not.toBe(davet1.token);
    const [eski] = await db
      .select()
      .from(baglantiDavetleri)
      .where(eq(baglantiDavetleri.token, davet1.token));
    const [yeni] = await db
      .select()
      .from(baglantiDavetleri)
      .where(eq(baglantiDavetleri.token, davet2.token));
    expect(eski?.iptalAt).not.toBeNull();
    expect(yeni?.iptalAt).toBeNull();

    // Olmayan butik
    expect((await istek('/davet', 'POST', { boutiqueId: crypto.randomUUID() })).status).toBe(404);
    expect((await istek('/davet', 'POST', { boutiqueId: 'x' })).status).toBe(400);

    // İsteğe bağlı ikas mağaza adı: ".myikas.com" kırpılır, biçim dışı ad 400
    const d3 = await istek('/davet', 'POST', {
      boutiqueId: butikId,
      magazaAdi: ' Lujo-Studio.myikas.com ',
    });
    expect(d3.status).toBe(201);
    const davet3 = (await d3.json()) as { token: string };
    const [m3] = await db
      .select()
      .from(baglantiDavetleri)
      .where(eq(baglantiDavetleri.token, davet3.token));
    expect(m3?.magazaAdi).toBe('lujo-studio');
    expect(m3?.magazaAdiKaynak).toBe('admin');
    const [m2] = await db
      .select()
      .from(baglantiDavetleri)
      .where(eq(baglantiDavetleri.token, davet2.token));
    expect(m2?.magazaAdi).toBeNull();
    expect(m2?.magazaAdiKaynak).toBeNull();
    expect(
      (await istek('/davet', 'POST', { boutiqueId: butikId, magazaAdi: 'kötü ad!' })).status,
    ).toBe(400);

    // Bağlantı + veriler
    await db.insert(butikBaglantilari).values({
      id: baglantiId,
      boutiqueId: butikId,
      platform: 'ikas',
      magazaAdi: `magaza-${tag}`,
      kimlikSifreli: 'x',
      durum: 'aktif',
      iletisimEposta: 'a@b.c',
      onaylayanAd: 'Ad',
      sartlarSurumu: '2026-10-deneme',
      onayAt: new Date(),
    });
    await db.insert(baglantiUrunleri).values([
      {
        baglantiId,
        boutiqueId: butikId,
        disUrunId: 'u1',
        url: 'https://e.com/1',
        sonGorulmeAt: new Date(),
      },
      {
        baglantiId,
        boutiqueId: butikId,
        disUrunId: 'u2',
        url: 'https://e.com/2',
        sonGorulmeAt: new Date(),
      },
      {
        baglantiId,
        boutiqueId: butikId,
        disUrunId: 'u3',
        url: 'https://e.com/3',
        aktif: false,
        sonGorulmeAt: new Date(),
      },
    ]);
    const g1 = `g${tag}1`.slice(0, 12);
    const g2 = `g${tag}2`.slice(0, 12);
    await db.insert(gonderimler).values([
      { id: g1, userId: kullanici, boutiqueId: butikId, url: 'https://e.com/1' },
      { id: g2, userId: kullanici, boutiqueId: butikId, url: 'https://e.com/2' },
      {
        id: `g${tag}3`.slice(0, 12),
        userId: kullanici,
        boutiqueId: butikId,
        url: 'https://e.com/3',
        createdAt: new Date('2020-01-01'),
      },
    ]);
    const siparis = (n: string, ek: Record<string, unknown>) => ({
      baglantiId,
      boutiqueId: butikId,
      disSiparisId: n,
      siparisNo: n,
      siparisAt: new Date(),
      durum: 'tamam',
      odendi: true,
      tutarMinor: 10000,
      currency: 'TRY',
      ...ek,
    });
    await db.insert(butikSiparisleri).values([
      siparis('s1', { gonderimId: g1, komisyonMinor: 1000 }),
      siparis('s2', { gonderimId: g2, komisyonMinor: 500 }),
      siparis('s3', { gonderimId: null, komisyonMinor: 700 }), // atıfsız
      siparis('s4', { gonderimId: g1, odendi: false }), // ödenmemiş
      siparis('s5', { gonderimId: g1, komisyonMinor: 900, siparisAt: new Date('2020-01-01') }), // eski ay
      // Tamamen iptal: komisyonu silinmiş, satış sayılmaz.
      siparis('s6', { gonderimId: g2, durum: 'iptal', komisyonMinor: null, iptalGorulduAt: new Date() }),
    ]);

    const liste = (await (await istek('')).json()) as Record<string, any>[];
    const satir = liste.find((r) => r.id === baglantiId);
    expect(satir?.butikAdi).toBe('Bağlı Butik');
    expect(satir?.durum).toBe('aktif');
    expect(satir?.tahsilat).toBe('deneme');
    expect(satir?.urunSayisi).toBe(2);
    expect(satir?.buAy.gonderim).toBe(2);
    expect(satir?.buAy.satis).toBe(2);
    expect(satir?.buAy.komisyon).toEqual([{ currency: 'TRY', minor: 1500 }]);
    expect('kimlikSifreli' in (satir ?? {})).toBe(false);

    // İade politikası
    const p = await istek(`/${baglantiId}`, 'PATCH', { iadePolitikasi: '  14 gün  ' });
    expect(p.status).toBe(200);
    expect(((await p.json()) as any).iadePolitikasi).toBe('14 gün');
    expect(
      (await istek(`/${baglantiId}`, 'PATCH', { iadePolitikasi: 'x'.repeat(601) })).status,
    ).toBe(400);
    const bos = await istek(`/${baglantiId}`, 'PATCH', { iadePolitikasi: null });
    expect(((await bos.json()) as any).iadePolitikasi).toBeNull();
    expect((await istek(`/${crypto.randomUUID()}`, 'PATCH', { iadePolitikasi: 'a' })).status).toBe(
      404,
    );

    // Kapat
    expect((await istek(`/${baglantiId}/kapat`, 'POST')).status).toBe(200);
    const [b] = await db
      .select()
      .from(butikBaglantilari)
      .where(eq(butikBaglantilari.id, baglantiId));
    expect(b?.durum).toBe('kapali');
    // Kaldırmadaki gibi token da silinir.
    expect(b?.kimlikSifreli).toBe('');
    const urunler = await db
      .select()
      .from(baglantiUrunleri)
      .where(eq(baglantiUrunleri.baglantiId, baglantiId));
    expect(urunler.every((u) => !u.aktif)).toBe(true);
    expect((await istek(`/${crypto.randomUUID()}/kapat`, 'POST')).status).toBe(404);
  } finally {
    await db.delete(boutiques).where(eq(boutiques.id, butikId)); // cascade
    await db.delete(users).where(eq(users.id, kullanici));
  }
});

test.skipIf(!testUrl)('admin bağlantılar: Shopify daveti, uygulama anahtarı saklanır', async () => {
  const url = new URL(testUrl!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/butika_notification_test')
  ) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl || !env.BAGLANTI_SIFRELEME_ANAHTARI)
    throw new Error('Database configuration was already loaded; run this test file separately');
  const { db } = await import('../../lib/db');
  const { adminBaglantilarRoutes } = await import('./baglantilar');
  const { signAdminAccessToken } = await import('../../lib/jwt');
  const { errorResponse } = await import('../../lib/errors');
  const { coz } = await import('../../lib/sifreleme');
  const { Hono } = await import('hono');
  const { eq } = await import('drizzle-orm');
  const { boutiques, baglantiDavetleri, butikBaglantilari, countries, shopifyUygulamalari } =
    await import('@butika/db');
  const app = new Hono().route('/admin/baglantilar', adminBaglantilarRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const butikId = crypto.randomUUID();
  const tag = butikId.slice(0, 8);
  const MAGAZA = `butika-${tag}.myshopify.com`;
  const GIZLI = `shopify-gizli-${tag}`;
  const adminToken = await signAdminAccessToken(crypto.randomUUID());
  const istek = (body: unknown) =>
    app.request('/admin/baglantilar/davet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    await db
      .insert(countries)
      .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
      .onConflictDoNothing();
    await db.insert(boutiques).values({
      id: butikId,
      countryCode: 'TR',
      name: 'Shopify Butik',
      url: `https://example.com/${butikId}`,
      coverImageUrl: 'https://example.com/c.jpg',
    });
    const temel = { boutiqueId: butikId, platform: 'shopify', magazaAdi: MAGAZA, clientId: 'cid' };

    // Eksik ya da hatalı alan → 400; yanıtta secret yok, kayıt yok
    const red = async (body: unknown) => {
      const r = await istek(body);
      expect(r.status).toBe(400);
      expect(await r.text()).not.toContain(GIZLI);
    };
    await red(temel); // clientSecret yok
    await red({ ...temel, clientSecret: '' });
    await red({ ...temel, clientId: undefined, clientSecret: GIZLI });
    await red({ ...temel, magazaAdi: 'evil.com', clientSecret: GIZLI });
    await red({ ...temel, magazaAdi: `${MAGAZA}.evil.com`, clientSecret: GIZLI });
    await red({ ...temel, magazaAdi: undefined, clientSecret: GIZLI });
    await red({ ...temel, platform: 'woo', clientSecret: GIZLI });
    expect(
      await db.select().from(shopifyUygulamalari).where(eq(shopifyUygulamalari.magaza, MAGAZA)),
    ).toEqual([]);

    // Geçerli: adres biçimi düzeltilir, secret şifreli saklanır, yanıtta yok
    const r = await istek({
      ...temel,
      magazaAdi: ` https://${MAGAZA.toUpperCase()}/ `,
      clientSecret: GIZLI,
    });
    expect(r.status).toBe(201);
    const metin = await r.text();
    expect(metin).not.toContain(GIZLI);
    const davet = JSON.parse(metin) as { token: string; link: string };
    expect(davet.link).toBe(`${env.KATILIM_SAYFASI_URL}?davet=${davet.token}`);
    const [uyg] = await db
      .select()
      .from(shopifyUygulamalari)
      .where(eq(shopifyUygulamalari.magaza, MAGAZA));
    expect(uyg?.clientId).toBe('cid');
    expect(uyg?.secretSifreli).not.toContain(GIZLI);
    expect(coz(uyg!.secretSifreli, env.BAGLANTI_SIFRELEME_ANAHTARI!)).toBe(GIZLI);
    const [d] = await db
      .select()
      .from(baglantiDavetleri)
      .where(eq(baglantiDavetleri.token, davet.token));
    expect(d?.platform).toBe('shopify');
    expect(d?.magazaAdi).toBe(MAGAZA);
    expect(d?.magazaAdiKaynak).toBe('admin');

    // ikas daveti varsayılan platformla
    const ikas = (await (await istek({ boutiqueId: butikId })).json()) as { token: string };
    const [di] = await db
      .select()
      .from(baglantiDavetleri)
      .where(eq(baglantiDavetleri.token, ikas.token));
    expect(di?.platform).toBe('ikas');

    // Olmayan butik: davet yok, yeni mağazanın anahtarı da saklanmaz
    const YENI = `yeni-${tag}.myshopify.com`;
    expect(
      (
        await istek({
          ...temel,
          boutiqueId: crypto.randomUUID(),
          magazaAdi: YENI,
          clientSecret: GIZLI,
        })
      ).status,
    ).toBe(404);
    expect(
      await db.select().from(shopifyUygulamalari).where(eq(shopifyUygulamalari.magaza, YENI)),
    ).toEqual([]);

    // Anahtar çakışması: mağazanın aktif Shopify bağlantısı var, client id farklı → 400
    const davetSayisi = async () =>
      (await db.select().from(baglantiDavetleri).where(eq(baglantiDavetleri.boutiqueId, butikId)))
        .length;
    const uygulamaSatiri = async () =>
      (
        await db.select().from(shopifyUygulamalari).where(eq(shopifyUygulamalari.magaza, MAGAZA))
      )[0]!;
    await db.insert(butikBaglantilari).values({
      boutiqueId: butikId,
      platform: 'shopify',
      magazaAdi: MAGAZA,
      kimlikSifreli: 'x',
      durum: 'aktif',
      iletisimEposta: 'a@b.c',
      onaylayanAd: 'Ad',
      sartlarSurumu: '2026-10-deneme',
      onayAt: new Date(),
    });
    const onceSayi = await davetSayisi();
    const onceUyg = await uygulamaSatiri();
    const cakisma = await istek({
      ...temel,
      clientId: 'baska-cid',
      clientSecret: `${GIZLI}-yeni`,
    });
    expect(cakisma.status).toBe(400);
    const cakismaMetin = await cakisma.text();
    expect(JSON.parse(cakismaMetin)).toEqual({ hata: 'shopify_anahtar_cakisiyor' });
    expect(cakismaMetin).not.toContain(GIZLI);
    // Hiçbir şey yazılmadı: anahtar aynı, davet eklenmedi, eski davet iptal edilmedi
    const sonraUyg = await uygulamaSatiri();
    expect(sonraUyg.clientId).toBe('cid');
    expect(sonraUyg.secretSifreli).toBe(onceUyg.secretSifreli);
    expect(await davetSayisi()).toBe(onceSayi);
    const [acik] = await db
      .select()
      .from(baglantiDavetleri)
      .where(eq(baglantiDavetleri.token, ikas.token));
    expect(acik?.iptalAt).toBeNull();

    // Aynı client id ile (secret yenileme) izin verilir
    const ayni = await istek({ ...temel, clientSecret: `${GIZLI}-yeni` });
    expect(ayni.status).toBe(201);
    expect(coz((await uygulamaSatiri()).secretSifreli, env.BAGLANTI_SIFRELEME_ANAHTARI!)).toBe(
      `${GIZLI}-yeni`,
    );
    // Bağlantı kapalıysa farklı client id kaydedilebilir
    await db
      .update(butikBaglantilari)
      .set({ durum: 'kapali' })
      .where(eq(butikBaglantilari.boutiqueId, butikId));
    expect((await istek({ ...temel, clientId: 'baska-cid', clientSecret: GIZLI })).status).toBe(
      201,
    );
    expect((await uygulamaSatiri()).clientId).toBe('baska-cid');

    // Liste secret döndürmez
    const liste = await app.request('/admin/baglantilar', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(await liste.text()).not.toContain(GIZLI);
  } finally {
    await db.delete(boutiques).where(eq(boutiques.id, butikId)); // cascade
    await db.delete(shopifyUygulamalari).where(eq(shopifyUygulamalari.magaza, MAGAZA));
    await db
      .delete(shopifyUygulamalari)
      .where(eq(shopifyUygulamalari.magaza, `yeni-${tag}.myshopify.com`));
  }
});
