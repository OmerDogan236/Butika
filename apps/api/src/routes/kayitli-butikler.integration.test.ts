import { expect, test } from 'bun:test';

// /kayitli-butikler: kalp ile kaydetme, liste, silme ve "Paylaş… → Butika" çözümü.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('kayıtlı butikler ve paylaşımdan kaydetme', async () => {
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
  const { kayitliButikRoutes } = await import('./kayitli-butikler');
  const { boutiqueRoutes } = await import('./boutiques');
  const { adminKullaniciButikleriRoutes } = await import('./admin/kullanici-butikleri');
  const { signAdminAccessToken } = await import('../lib/jwt');
  const { signAccessToken } = await import('../lib/jwt');
  const { errorResponse } = await import('../lib/errors');
  const { Hono } = await import('hono');
  const { and, eq, inArray } = await import('drizzle-orm');
  const { users, countries, boutiques, boutiqueSuggestions, kayitliButikler, savedProducts, trackedProducts } = await import('@butika/db');
  const app = new Hono()
    .route('/kayitli-butikler', kayitliButikRoutes)
    .route('/boutiques', boutiqueRoutes)
    .route('/admin/kullanici-butikleri', adminKullaniciButikleriRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const kullanici = crypto.randomUUID();
  const b = {
    lof: crypto.randomUUID(),
    vena: crypto.randomUUID(),
    pasif: crypto.randomUUID(),
    bekleyen: crypto.randomUUID(),
    reddedilen: crypto.randomUUID(),
  };
  const hesap = `yok_${kullanici.slice(0, 8)}`;
  try {
    await db
      .insert(countries)
      .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
      .onConflictDoNothing();
    await db.insert(users).values({ id: kullanici, email: `${kullanici}@test.local`, displayName: 'Test', countryCode: 'TR' });
    const ortak = { countryCode: 'TR', coverImageUrl: 'https://cdn.test/k.png' };
    await db.insert(boutiques).values([
      { ...ortak, id: b.lof, name: 'Love On Friday', url: 'https://www.love-onfriday.com/', instagram: 'shop_loveonfriday' },
      { ...ortak, id: b.vena, name: 'Vena', url: 'https://vena.com.tr' },
      { ...ortak, id: b.pasif, name: 'Pasif', url: 'https://pasif.test', instagram: 'pasif_butik', isActive: false },
      // Başka bir kullanıcının paylaşımla eklediği, onay bekleyen ve reddedilmiş butikler
      { ...ortak, id: b.bekleyen, name: 'Bekleyen', url: 'https://bekleyen.test', isActive: false, kullaniciDurumu: 'bekliyor' },
      { ...ortak, id: b.reddedilen, name: 'Red', url: 'https://red.test', isActive: false, kullaniciDurumu: 'reddedildi' },
    ]);
    const token = await signAccessToken(kullanici);
    const istek = (yol: string, init: RequestInit = {}) =>
      app.request(`/kayitli-butikler${yol}?country=TR`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
    const paylas = async (metin: string) =>
      (await (await istek('/paylasim', { method: 'POST', body: JSON.stringify({ metin }) })).json()) as {
        durum: string;
        butik?: { id: string; name: string };
        hesap?: string;
      };

    // Instagram profil linki → eşleşen butik kaydedilir
    const r1 = await paylas('https://www.instagram.com/shop_loveonfriday?igsh=abc');
    expect(r1.durum).toBe('kaydedildi');
    expect(r1.butik?.name).toBe('Love On Friday');

    // Butik sitesinden ürün sayfası → butik kaydedilir, ürün de Kayıtlı'ya girer (sayfa okunamasa da,
    // adı adresten). Sitenin ana sayfası paylaşılırsa yalnız butik kaydedilir.
    const r2 = (await paylas('bak https://www.vena.com.tr/urun/saten-elbise?utm_source=ig')) as {
      durum: string;
      butik?: { id: string };
      butikYeni?: boolean;
      urun?: { title: string };
    };
    expect(r2.durum).toBe('urun_kaydedildi');
    expect(r2.butik?.id).toBe(b.vena);
    expect(r2.butikYeni).toBe(false);
    expect(r2.urun?.title).toBe('saten elbise');
    const kayitliUrunler = await db.select().from(savedProducts).where(eq(savedProducts.userId, kullanici));
    expect(kayitliUrunler.map((u) => [u.url, u.boutiqueId])).toEqual([['https://www.vena.com.tr/urun/saten-elbise', b.vena]]);
    // Aynı ürün ikinci kez: yeni kayıt açılmaz
    await paylas('https://www.vena.com.tr/urun/saten-elbise');
    expect((await db.select().from(savedProducts).where(eq(savedProducts.userId, kullanici))).length).toBe(1);
    expect((await paylas('https://vena.com.tr/')).durum).toBe('kaydedildi');

    // Aynı butik iki kez → tek kayıt
    expect((await paylas('https://instagram.com/shop_loveonfriday/')).durum).toBe('kaydedildi');

    // Pasif butik ve Butika'da olmayan hesap kaydedilmez; bilinmeyen hesap öneri olur (bir kez)
    expect((await paylas('https://www.instagram.com/pasif_butik')).durum).toBe('oneri_alindi');
    const r3 = await paylas(`https://www.instagram.com/${hesap}`);
    expect(r3).toEqual({ durum: 'oneri_alindi', hesap });
    await paylas(`https://www.instagram.com/${hesap}?igsh=2`);
    const oneriler = await db
      .select()
      .from(boutiqueSuggestions)
      .where(eq(boutiqueSuggestions.url, `https://www.instagram.com/${hesap}`));
    expect(oneriler.length).toBe(1);
    expect(oneriler[0]?.status).toBe('dogrulama_bekliyor');

    // Diğer durumlar
    expect((await paylas('https://www.instagram.com/p/DOa1B2c3D4e/')).durum).toBe('gonderi_yakinda');
    // Butika'da olmayan, açılamayan site: butik sayılmaz, hiçbir butik oluşmaz
    expect((await paylas('https://tanimsiz-site.test/x')).durum).toBe('butik_degil');
    const olusan = await db.select().from(boutiques).where(eq(boutiques.url, 'https://tanimsiz-site.test'));
    expect(olusan.length).toBe(0);
    // Reddedilmiş kullanıcı butiği eklenemez; onay bekleyen butik "eklendi" olarak kaydedilir
    expect((await paylas('https://red.test')).durum).toBe('butik_degil');
    // Başkasının eklediği onay bekleyen butik: listesine almadan sayfası açılmaz, kalp de atılamaz
    const yetkiliDetay = (id: string) => app.request(`/boutiques/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    expect((await yetkiliDetay(b.bekleyen)).status).toBe(404);
    expect((await istek('', { method: 'POST', body: JSON.stringify({ boutiqueId: b.bekleyen }) })).status).toBe(404);
    const r4 = await paylas('https://www.bekleyen.test/urun');
    expect(r4.durum).toBe('eklendi');
    expect(r4.butik?.id).toBe(b.bekleyen);
    expect((await paylas('merhaba')).durum).toBe('anlasilmadi');

    // Liste: onay bekleyen dahil, en yeni önce, kaynaklarıyla
    const liste = (await (await istek('')).json()) as { id: string; kaynak: string; onayBekliyor: boolean }[];
    expect(liste.map((x) => [x.id, x.kaynak, x.onayBekliyor])).toEqual([
      [b.bekleyen, 'site', true],
      [b.vena, 'site', false],
      [b.lof, 'instagram', false],
    ]);
    // Onay bekleyen butiğin sayfası açılır, reddedilenin açılmaz
    const detay = (id: string) => app.request(`/boutiques/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    expect((await detay(b.bekleyen)).status).toBe(200);
    expect((await detay(b.reddedilen)).status).toBe(404);

    // Admin: bekleyenler listesi, onay → vitrine (isActive) çıkar; ikinci onay 404
    const adminToken = await signAdminAccessToken(crypto.randomUUID());
    const admin = (yol: string, method = 'GET') =>
      app.request(`/admin/kullanici-butikleri${yol}`, { method, headers: { Authorization: `Bearer ${adminToken}` } });
    const bekleyenler = (await (await admin('')).json()) as { id: string }[];
    expect(bekleyenler.some((x) => x.id === b.bekleyen)).toBe(true);
    expect((await admin(`/${b.bekleyen}/onayla`, 'POST')).status).toBe(200);
    expect((await admin(`/${b.bekleyen}/onayla`, 'POST')).status).toBe(404);
    const [onayli] = await db.select().from(boutiques).where(eq(boutiques.id, b.bekleyen));
    expect([onayli?.isActive, onayli?.kullaniciDurumu]).toEqual([true, 'onaylandi']);
    await db.delete(kayitliButikler).where(and(eq(kayitliButikler.userId, kullanici), eq(kayitliButikler.boutiqueId, b.bekleyen)));

    // Kalp: uygulamadan kaydet, pasif butik reddedilir, sil
    expect((await istek('', { method: 'DELETE' })).status).toBe(404);
    expect((await istek('', { method: 'POST', body: JSON.stringify({ boutiqueId: b.pasif }) })).status).toBe(404);
    expect((await istek(`/${b.vena}`, { method: 'DELETE' })).status).toBe(200);
    const sonra = (await (await istek('')).json()) as { id: string }[];
    expect(sonra.map((x) => x.id)).toEqual([b.lof]);
    expect((await istek('', { method: 'POST', body: JSON.stringify({ boutiqueId: b.vena }) })).status).toBe(201);
  } finally {
    await db.delete(savedProducts).where(eq(savedProducts.userId, kullanici));
    await db.delete(boutiqueSuggestions).where(eq(boutiqueSuggestions.userId, kullanici));
    await db.delete(kayitliButikler).where(eq(kayitliButikler.userId, kullanici));
    await db.delete(trackedProducts).where(inArray(trackedProducts.boutiqueId, Object.values(b)));
    await db.delete(boutiques).where(inArray(boutiques.id, Object.values(b)));
    await db.delete(users).where(eq(users.id, kullanici));
  }
});
