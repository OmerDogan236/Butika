import { expect, test } from 'bun:test';
import { createHmac, randomBytes } from 'node:crypto';

// Butik katılımı: şart onayı, ikas OAuth geri dönüşü, ikas paneli kurulum sayfası, kaldırma bildirimi.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('katılım: onay, ikas geri dönüş, kurulum, kaldırma bildirimi', async () => {
  const url = new URL(testUrl!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/butika_notification_test')
  ) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  // Sahte ikas uygulaması; gerçek anahtar yok.
  const ISTEMCI = 'test-istemci-kimligi';
  const GIZLI = 'test-istemci-gizli-anahtari';
  process.env.IKAS_CLIENT_ID = ISTEMCI;
  process.env.IKAS_CLIENT_SECRET = GIZLI;
  process.env.BAGLANTI_SIFRELEME_ANAHTARI = randomBytes(32).toString('base64');
  const { env } = await import('../env');
  if (env.DATABASE_URL !== testUrl || env.IKAS_CLIENT_ID !== ISTEMCI)
    throw new Error('Configuration was already loaded; run this test file separately');
  const { db } = await import('../lib/db');
  const { katilimRoutes, katilimBagimliliklari } = await import('./katilim');
  const { guvenlikBasliklari } = await import('../lib/guvenlik-basliklari');
  const { coz } = await import('../lib/sifreleme');
  const { errorResponse } = await import('../lib/errors');
  const { Hono } = await import('hono');
  const { eq } = await import('drizzle-orm');
  const { boutiques, baglantiDavetleri, butikBaglantilari, baglantiUrunleri, countries } =
    await import('@butika/db');
  const app = new Hono();
  app.use('*', guvenlikBasliklari);
  app.route('/katilim', katilimRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const imza = (m: string) => createHmac('sha256', GIZLI).update(m).digest('hex');
  const butikId = crypto.randomUUID();
  const tag = butikId.slice(0, 8);
  const MAGAZA = 'dev-x';
  const YETKILI = `yetkili-${tag}`;
  const ERISIM = `erisim-gizli-${tag}`;
  const YENILEME = `yenileme-gizli-${tag}`;

  // ikas sahte: token uç noktası ve GraphQL kimlik sorgusu.
  let tokenDurumu: 'ok' | 'red' | 'ag' = 'ok';
  let uygulamaKimligi = ISTEMCI;
  let kimlikDurumu: 'ok' | 'ag' = 'ok';
  // Kimlik sorgusu sırasında çalışır (geri dönüş sürerken yeni onay POST'u gibi).
  let kimlikSirasinda: (() => Promise<void>) | null = null;
  // ikas'a gönderilen sipariş bildirimi kayıtları (saveWebhook).
  const webhookKayitlari: unknown[] = [];
  katilimBagimliliklari.fetchFn = (async (adres: string | URL | Request, init?: RequestInit) => {
    const a = String(adres);
    if (a === `https://${MAGAZA}.myikas.com/api/admin/oauth/token`) {
      if (tokenDurumu === 'ag') throw new TypeError('fetch failed');
      if (tokenDurumu === 'red') return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({
        token_type: 'Bearer',
        expires_in: 14400,
        access_token: ERISIM,
        refresh_token: YENILEME,
        scope: 'read_products,read_orders,read_inventories',
      });
    }
    if (a === 'https://api.myikas.com/api/v1/admin/graphql') {
      if (kimlikDurumu === 'ag') throw new TypeError('fetch failed');
      if (kimlikSirasinda) {
        const f = kimlikSirasinda;
        kimlikSirasinda = null;
        await f();
      }
      const istek = JSON.parse(String(init?.body ?? '{}'));
      if (String(istek.query).includes('saveWebhook')) {
        webhookKayitlari.push(istek.variables.input);
        return Response.json({
          data: {
            saveWebhook: istek.variables.input.scopes.map((scope: string) => ({
              id: scope,
              scope,
            })),
          },
        });
      }
      return Response.json({
        data: {
          getAuthorizedApp: {
            id: YETKILI,
            storeAppId: uygulamaKimligi,
            scope: 'read_products,read_orders,read_inventories',
            deleted: false,
          },
          getMerchant: { id: `merchant-${tag}`, storeName: MAGAZA },
        },
      });
    }
    throw new Error(`beklenmeyen adres ${a}`);
  }) as typeof fetch;
  const gidenMailler: { alici: string; text: string }[] = [];
  katilimBagimliliklari.brevoHazir = () => true;
  katilimBagimliliklari.mailGonder = async (alici, icerik) => {
    gidenMailler.push({ alici, text: icerik.text });
    return { ok: true, messageId: 'x' };
  };

  const davetOlustur = async (magazaAdi: string | null = null) => {
    const token = randomBytes(32).toString('base64url');
    await db.insert(baglantiDavetleri).values({
      token,
      boutiqueId: butikId,
      magazaAdi,
      magazaAdiKaynak: magazaAdi ? 'admin' : null,
    });
    return token;
  };
  const davetiOku = async (token: string) =>
    (await db.select().from(baglantiDavetleri).where(eq(baglantiDavetleri.token, token)))[0]!;
  const baglantiyiOku = async () =>
    (await db.select().from(butikBaglantilari).where(eq(butikBaglantilari.boutiqueId, butikId)))[0];
  const onay = { kabul: true, onaylayanAd: 'Ayşe Deneme', iletisimEposta: 'butik@example.com' };
  const onayla = (token: string, body: unknown) =>
    app.request(`/katilim/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const durumAl = async (token: string) => {
    const r = await onayla(token, onay);
    expect(r.status).toBe(200);
    return (await davetiOku(token)).durumAnahtari!;
  };
  const geriDonus = (q: Record<string, string>) =>
    app.request(`/katilim/ikas/geri-donus?${new URLSearchParams(q)}`);
  const hataKodu = (r: Response) => {
    expect(r.status).toBe(302);
    const yer = r.headers.get('location') ?? '';
    expect(yer.startsWith(env.KATILIM_SAYFASI_URL)).toBe(true);
    return new URL(yer).searchParams.get('hata');
  };
  // Başarısız geri dönüşte: bağlantı yok, davet kullanılmadı, token hiçbir yerde yok.
  const izYok = async (r: Response, token: string) => {
    expect(await baglantiyiOku()).toBeUndefined();
    expect((await davetiOku(token)).kullanildiAt).toBeNull();
    const metin = `${r.headers.get('location')} ${await r.text()}`;
    expect(metin).not.toContain(ERISIM);
    expect(metin).not.toContain(YENILEME);
    expect(metin).not.toContain(GIZLI);
  };

  try {
    await db
      .insert(countries)
      .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
      .onConflictDoNothing();
    await db.insert(boutiques).values({
      id: butikId,
      countryCode: 'TR',
      name: 'Lujo Studio',
      url: `https://example.com/${butikId}`,
      coverImageUrl: 'https://example.com/c.jpg',
    });

    // --- GET /katilim/:token
    const t1 = await davetOlustur(MAGAZA);
    const bilgi = await app.request(`/katilim/${t1}`);
    expect(bilgi.status).toBe(200);
    expect(await bilgi.json()).toEqual({
      butikAdi: 'Lujo Studio',
      platform: 'ikas',
      sartlarSurumu: '2026-10-deneme',
      komisyonOrani: 10,
      magazaAdi: MAGAZA,
    });
    expect((await app.request(`/katilim/${randomBytes(32).toString('base64url')}`)).status).toBe(
      404,
    );

    // --- POST /katilim/:token
    const p1 = await onayla(t1, onay);
    expect(p1.status).toBe(200);
    const { yetkiAdresi } = (await p1.json()) as { yetkiAdresi: string };
    const kayit1 = await davetiOku(t1);
    expect(kayit1.durumAnahtari).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(kayit1.durumAt).not.toBeNull();
    expect(kayit1.onaylayanAd).toBe('Ayşe Deneme');
    expect(kayit1.iletisimEposta).toBe('butik@example.com');
    expect(kayit1.sartlarSurumu).toBe('2026-10-deneme');
    expect(kayit1.onayAt).not.toBeNull();
    const ya = new URL(yetkiAdresi);
    expect(`${ya.host}${ya.pathname}`).toBe('dev-x.myikas.com/api/admin/oauth/authorize');
    expect(ya.searchParams.get('state')).toBe(kayit1.durumAnahtari);
    expect(ya.searchParams.get('client_id')).toBe(ISTEMCI);
    expect(yetkiAdresi).not.toContain(GIZLI);
    // Tekrar POST: yeni state, eskisi geçersiz
    const eskiDurum = kayit1.durumAnahtari!;
    const yeniDurum = await durumAl(t1);
    expect(yeniDurum).not.toBe(eskiDurum);
    expect(hataKodu(await geriDonus({ code: 'k', state: eskiDurum, storeName: MAGAZA }))).toBe(
      'suresi_doldu',
    );

    expect((await onayla(t1, { ...onay, kabul: false })).status).toBe(400);
    expect((await onayla(t1, { ...onay, iletisimEposta: 'eposta-degil' })).status).toBe(400);
    expect((await onayla(t1, { ...onay, onaylayanAd: 'A' })).status).toBe(400);
    const t2 = await davetOlustur(null);
    const p2 = await onayla(t2, onay);
    expect(p2.status).toBe(400);
    expect(await p2.json()).toEqual({ hata: 'magaza_adi_gerekli' });
    // Butiğin yazdığı ad: önce yanlış, sonra düzeltilir (".myikas.com" kırpılır)
    const yanlis = await onayla(t2, { ...onay, magazaAdi: 'devx' });
    expect(yanlis.status).toBe(200);
    expect(new URL(((await yanlis.json()) as { yetkiAdresi: string }).yetkiAdresi).host).toBe(
      'devx.myikas.com',
    );
    expect((await davetiOku(t2)).magazaAdiKaynak).toBe('butik');
    // Butiğin yazdığı ad sabit sayılmaz: sayfa yeniden sorar
    expect(
      ((await (await app.request(`/katilim/${t2}`)).json()) as { magazaAdi: string | null })
        .magazaAdi,
    ).toBeNull();
    const p3 = await onayla(t2, { ...onay, magazaAdi: 'dev-x.myikas.com' });
    expect(p3.status).toBe(200);
    expect(new URL(((await p3.json()) as { yetkiAdresi: string }).yetkiAdresi).host).toBe(
      'dev-x.myikas.com',
    );
    expect((await davetiOku(t2)).magazaAdi).toBe(MAGAZA);
    // Butik adı yeniden yazmazsa öncekiyle devam eder
    expect((await onayla(t2, onay)).status).toBe(200);
    expect((await davetiOku(t2)).magazaAdi).toBe(MAGAZA);
    // Admin'in yazdığı ad body ile değişmez
    const p4 = await onayla(t1, { ...onay, magazaAdi: 'baska-magaza' });
    expect(new URL(((await p4.json()) as { yetkiAdresi: string }).yetkiAdresi).host).toBe(
      'dev-x.myikas.com',
    );
    const admininki = await davetiOku(t1);
    expect(admininki.magazaAdi).toBe(MAGAZA);
    expect(admininki.magazaAdiKaynak).toBe('admin');

    // --- Geri dönüş: hata durumları (Review Focus 1)
    const durum = await durumAl(t1);
    const kod = 'kod-123';
    let r = await geriDonus({ error: 'access_denied', state: durum });
    expect(hataKodu(r)).toBe('izin_verilmedi');
    await izYok(r, t1);

    r = await geriDonus({ code: kod, state: durum, storeName: MAGAZA, signature: 'ab'.repeat(32) });
    expect(hataKodu(r)).toBe('gecersiz');
    await izYok(r, t1);

    r = await geriDonus({ code: kod, storeName: MAGAZA });
    expect(hataKodu(r)).toBe('davet_gerekli');
    await izYok(r, t1);

    await db
      .update(baglantiDavetleri)
      .set({ durumAt: new Date(Date.now() - 31 * 60_000) })
      .where(eq(baglantiDavetleri.token, t1));
    r = await geriDonus({ code: kod, state: durum, storeName: MAGAZA });
    expect(hataKodu(r)).toBe('suresi_doldu');
    await izYok(r, t1);

    let durum2 = await durumAl(t1);
    r = await geriDonus({ code: kod, state: durum2, storeName: 'baska-magaza' });
    expect(hataKodu(r)).toBe('magaza_uyusmuyor');
    await izYok(r, t1);
    r = await geriDonus({ code: kod, state: durum2 });
    expect(hataKodu(r)).toBe('magaza_uyusmuyor');
    await izYok(r, t1);

    tokenDurumu = 'red';
    r = await geriDonus({ code: kod, state: durum2, storeName: MAGAZA });
    expect(hataKodu(r)).toBe('gecersiz');
    await izYok(r, t1);

    // Geçici ağ hatası: ayrı kod; davet ve state yeniden kullanılabilir
    tokenDurumu = 'ag';
    r = await geriDonus({ code: kod, state: durum2, storeName: MAGAZA });
    expect(hataKodu(r)).toBe('gecici');
    await izYok(r, t1);
    expect((await davetiOku(t1)).durumAnahtari).toBe(durum2);
    tokenDurumu = 'ok';

    // Kimlik sorgusunda ağ hatası da geçici
    kimlikDurumu = 'ag';
    r = await geriDonus({ code: kod, state: durum2, storeName: MAGAZA });
    expect(hataKodu(r)).toBe('gecici');
    await izYok(r, t1);
    kimlikDurumu = 'ok';

    // Geri dönüş sürerken yeni onay (yeni state): eski state işlenmez
    kimlikSirasinda = async () => {
      await durumAl(t1);
    };
    r = await geriDonus({ code: kod, state: durum2, storeName: MAGAZA });
    expect(hataKodu(r)).toBe('suresi_doldu');
    await izYok(r, t1);
    expect(kimlikSirasinda).toBeNull();
    durum2 = (await davetiOku(t1)).durumAnahtari!;

    uygulamaKimligi = 'baska-uygulama';
    r = await geriDonus({ code: kod, state: durum2, storeName: MAGAZA });
    expect(hataKodu(r)).toBe('gecersiz');
    await izYok(r, t1);
    uygulamaKimligi = ISTEMCI;

    // --- Geri dönüş: mutlu yol (doğru imzayla)
    r = await geriDonus({ code: kod, state: durum2, storeName: MAGAZA, signature: imza(kod) });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe(new URL('tamam/', env.KATILIM_SAYFASI_URL).toString());
    expect(r.headers.get('location')).toContain('/katil/tamam/');
    const b1 = (await baglantiyiOku())!;
    expect(b1).toBeDefined();
    expect(b1.platform).toBe('ikas');
    expect(b1.magazaAdi).toBe(MAGAZA);
    expect(b1.durum).toBe('aktif');
    expect(b1.tahsilat).toBe('deneme');
    expect(b1.ikasYetkiliUygulamaId).toBe(YETKILI);
    expect(b1.ikasMerchantId).toBe(`merchant-${tag}`);
    expect(b1.baglandiAt).not.toBeNull();
    expect(b1.kimlikSifreli).not.toContain(ERISIM);
    expect(b1.kimlikSifreli).not.toContain(YENILEME);
    const tokenlar = JSON.parse(coz(b1.kimlikSifreli, env.BAGLANTI_SIFRELEME_ANAHTARI!));
    expect(tokenlar.erisim).toBe(ERISIM);
    expect(tokenlar.yenileme).toBe(YENILEME);
    expect(typeof tokenlar.bitisAt).toBe('string');
    const kullanilan = await davetiOku(t1);
    expect(b1.onaylayanAd).toBe(kullanilan.onaylayanAd!);
    expect(b1.iletisimEposta).toBe(kullanilan.iletisimEposta!);
    expect(b1.sartlarSurumu).toBe(kullanilan.sartlarSurumu!);
    expect(b1.onayAt.getTime()).toBe(kullanilan.onayAt!.getTime());
    expect(kullanilan.kullanildiAt).not.toBeNull();
    expect(`${r.headers.get('location')} ${await r.text()}`).not.toContain(ERISIM);
    expect(gidenMailler).toHaveLength(1);
    expect(gidenMailler[0]!.alici).toBe('butik@example.com');
    expect(gidenMailler[0]!.text).toContain('Lujo Studio');
    // Sipariş bildirimleri ikas'a arka planda kaydedilir (tek uç: /katilim/ikas/bildirim).
    for (let i = 0; i < 50 && webhookKayitlari.length === 0; i++) await Bun.sleep(20);
    expect(webhookKayitlari).toEqual([
      {
        endpoint: `${new URL(env.IKAS_YONLENDIRME_URL).origin}/katilim/ikas/bildirim`,
        scopes: ['store/order/created', 'store/order/updated'],
      },
    ]);

    // Aynı state ikinci kez
    expect(hataKodu(await geriDonus({ code: kod, state: durum2, storeName: MAGAZA }))).toBe(
      'suresi_doldu',
    );
    // Kullanılmış davet
    expect((await app.request(`/katilim/${t1}`)).status).toBe(404);
    expect((await onayla(t1, onay)).status).toBe(404);

    // --- ikas paneli kurulum sayfası (iframe)
    const kurulum = (q: Partial<Record<string, string>>, merchantId = `merchant-${tag}`) => {
      const ts = String(Date.now());
      const p = {
        storeName: MAGAZA,
        merchantId,
        timestamp: ts,
        signature: imza(`${MAGAZA}${merchantId}${ts}`),
        authorizedAppId: YETKILI,
        ...q,
      };
      return app.request(
        `/katilim/ikas/kurulum?${new URLSearchParams(p as Record<string, string>)}`,
      );
    };
    let k = await kurulum({});
    expect(k.status).toBe(200);
    expect(k.headers.get('content-type')).toContain('text/html');
    expect(k.headers.get('x-frame-options')).toBeNull();
    expect(k.headers.get('content-security-policy')).toContain('frame-ancestors');
    let sayfa = await k.text();
    expect(sayfa).toContain('Butika bağlantınız açık');
    expect(sayfa).toContain('Bağlantınız kurulu. Ürünleriniz Butika’ya düzenli olarak aktarılıyor.');
    expect(sayfa).not.toContain('görünüyor');
    expect(sayfa).not.toMatch(/<script|<link|https?:\/\/(?!butika\.ai)/);
    // İmzalı merchantId'ye göre: imzasız authorizedAppId sonucu değiştirmez
    k = await kurulum({ authorizedAppId: 'bilinmeyen' });
    expect(await k.text()).toContain('Butika bağlantınız açık');
    k = await kurulum({}, 'baska-merchant');
    expect(k.status).toBe(200);
    sayfa = await k.text();
    expect(sayfa).toContain('davet linki');
    expect(sayfa).not.toContain('bağlantınız açık');
    k = await kurulum({ signature: 'ab'.repeat(32) });
    expect(k.status).toBe(400);
    expect(await k.text()).not.toContain('bağlantınız açık');
    // Diğer sayfalarda çerçeve yasağı sürer
    expect((await app.request(`/katilim/${t1}`)).headers.get('x-frame-options')).toBe('SAMEORIGIN');

    // --- Kaldırma bildirimi
    await db.insert(baglantiUrunleri).values([
      {
        baglantiId: b1.id,
        boutiqueId: butikId,
        disUrunId: 'u1',
        url: 'https://e.com/1',
        sonGorulmeAt: new Date(),
      },
      {
        baglantiId: b1.id,
        boutiqueId: butikId,
        disUrunId: 'u2',
        url: 'https://e.com/2',
        sonGorulmeAt: new Date(),
      },
    ]);
    const bildirim = (govde: Record<string, unknown>) =>
      app.request('/katilim/ikas/bildirim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(govde),
      });
    const veri = JSON.stringify({ authorizedAppId: YETKILI });
    const silindi = {
      id: 'w1',
      createdAt: new Date().toISOString(),
      scope: 'store/app/deleted',
      merchantId: `merchant-${tag}`,
      authorizedAppId: YETKILI,
      data: veri,
      signature: imza(veri),
    };
    const degismedi = async () => {
      const simdi = (await baglantiyiOku())!;
      expect(simdi.durum).toBe('aktif');
      expect(simdi.kimlikSifreli).toBe(b1.kimlikSifreli);
      expect(simdi.updatedAt.getTime()).toBe(b1.updatedAt.getTime());
    };
    expect((await bildirim({ ...silindi, signature: 'ab'.repeat(32) })).status).toBe(401);
    await degismedi();
    // Geri dönüşteki imzalı code bildirim gibi yeniden gönderilir: data nesne değil → 401
    expect((await bildirim({ ...silindi, data: kod, signature: imza(kod) })).status).toBe(401);
    await degismedi();
    // İçteki kimlik dıştakiyle uyuşmuyor → 401
    const icBaska = JSON.stringify({ authorizedAppId: 'baska-uygulama' });
    expect((await bildirim({ ...silindi, data: icBaska, signature: imza(icBaska) })).status).toBe(
      401,
    );
    await degismedi();
    const icKapsam = JSON.stringify({ scope: 'store/order/created' });
    expect((await bildirim({ ...silindi, data: icKapsam, signature: imza(icKapsam) })).status).toBe(
      401,
    );
    await degismedi();
    // Bağlantının mağazası başka → 200, değişiklik yok
    expect((await bildirim({ ...silindi, merchantId: 'baska-merchant' })).status).toBe(200);
    await degismedi();
    // Bilinmeyen scope yok sayılır, değişiklik yok
    const baska = JSON.stringify({ x: 1 });
    expect(
      (
        await bildirim({
          ...silindi,
          scope: 'store/product/updated',
          data: baska,
          signature: imza(baska),
        })
      ).status,
    ).toBe(200);
    await degismedi();

    expect((await bildirim(silindi)).status).toBe(200);
    const kapali = (await baglantiyiOku())!;
    expect(kapali.durum).toBe('kapali');
    expect(kapali.kimlikSifreli).toBe('');
    const urunler = await db
      .select()
      .from(baglantiUrunleri)
      .where(eq(baglantiUrunleri.baglantiId, b1.id));
    expect(urunler.length).toBe(2);
    expect(urunler.every((u) => !u.aktif)).toBe(true);
    // İkinci teslimat: 200, değişiklik yok
    expect((await bildirim(silindi)).status).toBe(200);
    expect((await baglantiyiOku())!.updatedAt.getTime()).toBe(kapali.updatedAt.getTime());
    // Kapalı bağlantı panelde "bağlı değil" görünür
    expect(await (await kurulum({})).text()).toContain('davet linki');

    // --- Bağlantı ayarları eksik (production açılır, özellik kapalı): ikas yolları ve onay 503
    env.BAGLANTI_KULLANILABILIR = false;
    try {
      const kapaliKurulum = await kurulum({});
      expect(kapaliKurulum.status).toBe(503);
      expect(await kapaliKurulum.text()).toContain('kullanılamıyor');
      expect((await bildirim(silindi)).status).toBe(503);
      const kapaliDonus = await geriDonus({ code: 'kod-x', state: 'x', storeName: MAGAZA });
      expect(kapaliDonus.status).toBe(302);
      expect(kapaliDonus.headers.get('location')).toContain('hata=gecici');
      const t4 = await davetOlustur(MAGAZA);
      expect((await onayla(t4, onay)).status).toBe(503);
    } finally {
      env.BAGLANTI_KULLANILABILIR = true;
    }

    // --- Yeniden bağlanma: aynı satır güncellenir; sipariş taraması kapalı dönemi taramaz
    await db
      .update(butikBaglantilari)
      .set({ sonSiparisTaramaAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(butikBaglantilari.id, b1.id));
    const t3 = await davetOlustur(MAGAZA);
    const durum3 = await durumAl(t3);
    r = await geriDonus({ code: 'kod-2', state: durum3, storeName: MAGAZA });
    expect(r.headers.get('location')).toContain('/katil/tamam/');
    const b2 = (await baglantiyiOku())!;
    expect(b2.id).toBe(b1.id);
    expect(b2.durum).toBe('aktif');
    expect(b2.sonHata).toBeNull();
    expect(b2.kimlikSifreli).not.toBe('');
    expect(b2.baglandiAt!.getTime()).toBeGreaterThan(b1.baglandiAt!.getTime());
    expect(b2.sonSiparisTaramaAt!.getTime()).toBe(b2.baglandiAt!.getTime());
    // Yeniden bağlanmadan önceki (eski) kaldırma bildirimi yeni bağlantıyı kapatmaz
    expect((await bildirim(silindi)).status).toBe(200);
    const b3 = (await baglantiyiOku())!;
    expect(b3.durum).toBe('aktif');
    expect(b3.kimlikSifreli).toBe(b2.kimlikSifreli);
    // Güncel tarihli bildirim kapatır
    expect((await bildirim({ ...silindi, createdAt: new Date().toISOString() })).status).toBe(200);
    expect((await baglantiyiOku())!.durum).toBe('kapali');
  } finally {
    await db.delete(boutiques).where(eq(boutiques.id, butikId)); // cascade
  }
});
