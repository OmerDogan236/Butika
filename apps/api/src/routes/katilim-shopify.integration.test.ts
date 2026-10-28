import { expect, test } from 'bun:test';
import { createHmac, randomBytes } from 'node:crypto';

// Butik katılımı (Shopify): şart onayı, uygulama adresi (kurulum linki önce), OAuth geri dönüşü.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('katılım shopify: onay, uygulama adresi, geri dönüş', async () => {
  const url = new URL(testUrl!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/butika_notification_test')
  ) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  // Bağlantı özelliği açık olsun diye sahte ikas anahtarları; gerçek anahtar yok.
  process.env.IKAS_CLIENT_ID = 'test-istemci-kimligi';
  process.env.IKAS_CLIENT_SECRET = 'test-istemci-gizli-anahtari';
  process.env.BAGLANTI_SIFRELEME_ANAHTARI = randomBytes(32).toString('base64');
  const { env } = await import('../env');
  if (env.DATABASE_URL !== testUrl || !env.BAGLANTI_KULLANILABILIR)
    throw new Error('Configuration was already loaded; run this test file separately');
  const { db } = await import('../lib/db');
  const { katilimRoutes, katilimBagimliliklari } = await import('./katilim');
  const { shopifyKatilimSaati } = await import('./katilim-shopify');
  const { shopifyUygulamasiKaydet } = await import('../lib/baglanti/shopify/shopify-uygulamalari');
  const { coz } = await import('../lib/sifreleme');
  const { errorResponse } = await import('../lib/errors');
  const { Hono } = await import('hono');
  const { eq, inArray } = await import('drizzle-orm');
  const { boutiques, baglantiDavetleri, butikBaglantilari, countries, shopifyUygulamalari } =
    await import('@butika/db');
  const app = new Hono();
  app.route('/katilim', katilimRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const butikId = crypto.randomUUID();
  const tag = butikId.slice(0, 8);
  const MAGAZA = 'butika-deneme.myshopify.com';
  const BASKA = `baska-${tag}.myshopify.com`;
  const KIMLIK = `istemci-${tag}`;
  const GIZLI = `shopify-gizli-${tag}`;
  const BASKA_GIZLI = `baska-gizli-${tag}`;
  const ERISIM = `shpua_erisim-${tag}`;
  const YENILEME = `shprt_yenileme-${tag}`;
  const KOD = `kod-${tag}`;

  // Shopify sahte: token uç noktası ve bildirim aboneliği. Diğer istekler (arka plan
  // eşitlemesi) ağ hatası.
  let tokenDurumu: 'ok' | 'red' = 'ok';
  let tokenIstekleri = 0;
  const abonelikler: { magaza: string; uri: string }[] = [];
  katilimBagimliliklari.fetchFn = (async (adres: string | URL | Request, init?: RequestInit) => {
    const a = String(adres);
    if (a.startsWith(`https://${MAGAZA}/admin/api/`) && a.endsWith('/graphql.json')) {
      const govde = JSON.parse(String(init?.body));
      if (String(govde.query).includes('webhookSubscriptionCreate')) {
        abonelikler.push({ magaza: MAGAZA, uri: govde.variables.abonelik.uri });
        const data: Record<string, unknown> = {};
        for (let i = 0; i < 5; i++)
          data[`k${i}`] = { webhookSubscription: { id: `gid://w/${i}` }, userErrors: [] };
        return Response.json({ data });
      }
    }
    if (a === `https://${MAGAZA}/admin/oauth/access_token`) {
      tokenIstekleri++;
      if (tokenDurumu === 'red')
        return Response.json({ error: 'invalid_request' }, { status: 400 });
      return Response.json({
        access_token: ERISIM,
        scope: 'read_products,read_orders,read_legal_policies',
        expires_in: 3599,
        refresh_token: YENILEME,
        refresh_token_expires_in: 777599,
      });
    }
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  const gidenMailler: { alici: string; text: string }[] = [];
  katilimBagimliliklari.brevoHazir = () => true;
  katilimBagimliliklari.mailGonder = async (alici, icerik) => {
    gidenMailler.push({ alici, text: icerik.text });
    return { ok: true, messageId: 'x' };
  };

  /** Shopify'ın imzaladığı gibi: hmac hariç anahtara göre sıralı k=v&..., hex HMAC-SHA256. */
  const imzali = (q: Record<string, string>, secret = GIZLI) => {
    const mesaj = Object.keys(q)
      .sort()
      .map((k) => `${k}=${q[k]}`)
      .join('&');
    const hmac = createHmac('sha256', secret).update(mesaj).digest('hex');
    return new URLSearchParams({ ...q, hmac }).toString();
  };
  const zaman = (geri = 0) => String(Math.floor(Date.now() / 1000) - geri);
  // Her yanıtın yönlendirme adresi ve gövdesi; sonda gizli değer aranır.
  const yanitlar: string[] = [];
  const geriDonus = async (q: Record<string, string>, secret = GIZLI, imzala = true) => {
    const sorgu = imzala ? imzali(q, secret) : new URLSearchParams(q).toString();
    const r = await app.request(`/katilim/shopify/geri-donus?${sorgu}`);
    yanitlar.push(`${r.headers.get('location') ?? ''} ${await r.clone().text()}`);
    return r;
  };
  const uygulama = async (q: Record<string, string>, secret = GIZLI) => {
    const r = await app.request(`/katilim/shopify/uygulama?${imzali(q, secret)}`);
    yanitlar.push(`${r.headers.get('location') ?? ''} ${await r.clone().text()}`);
    return r;
  };
  const hataKodu = (r: Response) => {
    expect(r.status).toBe(302);
    const yer = r.headers.get('location') ?? '';
    expect(yer.startsWith(env.KATILIM_SAYFASI_URL)).toBe(true);
    return new URL(yer).searchParams.get('hata');
  };
  const davetOlustur = async (platform: 'ikas' | 'shopify', magazaAdi: string) => {
    const token = randomBytes(32).toString('base64url');
    await db
      .insert(baglantiDavetleri)
      .values({ token, boutiqueId: butikId, platform, magazaAdi, magazaAdiKaynak: 'admin' });
    return token;
  };
  const davetiOku = async (token: string) =>
    (await db.select().from(baglantiDavetleri).where(eq(baglantiDavetleri.token, token)))[0]!;
  const baglantiyiOku = async () =>
    (await db.select().from(butikBaglantilari).where(eq(butikBaglantilari.boutiqueId, butikId)))[0];
  const onay = { kabul: true, onaylayanAd: 'Ayşe Deneme', iletisimEposta: 'butik@example.com' };
  const onayla = async (token: string) => {
    const r = await app.request(`/katilim/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(onay),
    });
    expect(r.status).toBe(200);
    return (await r.json()) as { yetkiAdresi: string };
  };
  const izYok = async (token: string) => {
    expect(await baglantiyiOku()).toBeUndefined();
    expect((await davetiOku(token)).kullanildiAt).toBeNull();
  };

  try {
    await db
      .insert(countries)
      .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
      .onConflictDoNothing();
    await db.insert(boutiques).values({
      id: butikId,
      countryCode: 'TR',
      name: 'Casa Deneme',
      url: `https://example.com/${butikId}`,
      coverImageUrl: 'https://example.com/c.jpg',
    });
    await shopifyUygulamasiKaydet(MAGAZA, KIMLIK, GIZLI);
    await shopifyUygulamasiKaydet(BASKA, `baska-istemci-${tag}`, BASKA_GIZLI);

    // --- GET /katilim/:token: platform ve admin'in yazdığı mağaza
    const t1 = await davetOlustur('shopify', MAGAZA);
    const bilgi = await app.request(`/katilim/${t1}`);
    expect(bilgi.status).toBe(200);
    expect(await bilgi.json()).toMatchObject({ platform: 'shopify', magazaAdi: MAGAZA });

    // --- Uygulama adresi: davet onaylanmadan → davet linki metni
    const bos = await uygulama({ shop: MAGAZA, timestamp: zaman(), host: 'aG9zdA' });
    expect(bos.status).toBe(200);
    expect(await bos.text()).toContain('davet linki');

    // --- POST /katilim/:token: yetki adresi Shopify mağazasına, state davette
    const { yetkiAdresi } = await onayla(t1);
    const state = (await davetiOku(t1)).durumAnahtari!;
    expect(yetkiAdresi.startsWith(`https://${MAGAZA}/admin/oauth/authorize?`)).toBe(true);
    const yetkiSorgu = new URL(yetkiAdresi).searchParams;
    expect(yetkiSorgu.get('state')).toBe(state);
    expect(yetkiSorgu.get('client_id')).toBe(KIMLIK);
    expect(yetkiAdresi).not.toContain(GIZLI);

    // --- Uygulama adresi: kurulum linki önce, bekleyen onaylı davet → yetki adresine
    const yon = await uygulama({ shop: MAGAZA, timestamp: zaman(), host: 'aG9zdA' });
    expect(yon.status).toBe(302);
    const yonAdres = yon.headers.get('location') ?? '';
    expect(yonAdres.startsWith(`https://${MAGAZA}/admin/oauth/authorize?`)).toBe(true);
    expect(new URL(yonAdres).searchParams.get('state')).toBe(state);
    // Başka mağaza (kayıtlı ama daveti yok) → davet linki metni
    const baskaSayfa = await uygulama({ shop: BASKA, timestamp: zaman() }, BASKA_GIZLI);
    expect(baskaSayfa.status).toBe(200);
    expect(await baskaSayfa.text()).toContain('davet linki');
    // Yanlış imza → 400
    expect((await uygulama({ shop: MAGAZA, timestamp: zaman() }, 'yanlis')).status).toBe(400);
    // Kayıtsız mağaza → 400
    expect((await uygulama({ shop: `yok-${tag}.myshopify.com`, timestamp: zaman() })).status).toBe(
      400,
    );
    // Tekrar oynatma: doğru imzalı ama 301 sn eski, ileri tarihli, zamansız ya da sayısal olmayan → 400
    expect((await uygulama({ shop: MAGAZA, timestamp: zaman(301) })).status).toBe(400);
    expect((await uygulama({ shop: MAGAZA, timestamp: zaman(-301) })).status).toBe(400);
    expect((await uygulama({ shop: MAGAZA })).status).toBe(400);
    expect((await uygulama({ shop: MAGAZA, timestamp: 'abc' })).status).toBe(400);
    // Sınırın içinde (299 sn) kabul
    expect((await uygulama({ shop: MAGAZA, timestamp: zaman(299) })).status).toBe(302);
    // Saat enjekte edilebilir: sorgu taze, sunucu saati 301 sn ileride → 400
    const sabit = zaman();
    shopifyKatilimSaati.simdi = () => (Number(sabit) + 301) * 1000;
    expect((await uygulama({ shop: MAGAZA, timestamp: sabit })).status).toBe(400);
    shopifyKatilimSaati.simdi = () => (Number(sabit) + 300) * 1000;
    expect((await uygulama({ shop: MAGAZA, timestamp: sabit })).status).toBe(302);
    shopifyKatilimSaati.simdi = () => Date.now();

    const temel = () => ({ code: KOD, shop: MAGAZA, state, timestamp: zaman(), host: 'aG9zdA' });

    // --- Geri dönüş: yanlış imza, imzasız, kayıtsız mağaza → gecersiz
    expect(hataKodu(await geriDonus(temel(), 'yanlis-gizli'))).toBe('gecersiz');
    expect(hataKodu(await geriDonus(temel(), GIZLI, false))).toBe('gecersiz');
    expect(hataKodu(await geriDonus({ ...temel(), shop: `yok-${tag}.myshopify.com` }))).toBe(
      'gecersiz',
    );
    expect(hataKodu(await geriDonus({ ...temel(), shop: 'evil.com' }))).toBe('gecersiz');
    // Tekrar oynatma: doğru imzalı ama bayat/zamansız sorgu → gecersiz (token istenmez)
    expect(hataKodu(await geriDonus({ ...temel(), timestamp: zaman(301) }))).toBe('gecersiz');
    expect(hataKodu(await geriDonus({ ...temel(), timestamp: zaman(-301) }))).toBe('gecersiz');
    const { timestamp: _t, ...zamansiz } = temel();
    expect(hataKodu(await geriDonus(zamansiz))).toBe('gecersiz');
    expect(hataKodu(await geriDonus({ ...temel(), timestamp: '1e9' }))).toBe('gecersiz');
    expect(tokenIstekleri).toBe(0);
    await izYok(t1);

    // İzin verilmedi
    const { code: _c, ...kodsuz } = temel();
    expect(hataKodu(await geriDonus({ ...kodsuz, error: 'access_denied' }))).toBe('izin_verilmedi');
    // state yok → davet gerekli
    const { state: _s, ...statesiz } = temel();
    expect(hataKodu(await geriDonus(statesiz))).toBe('davet_gerekli');
    // Bilinmeyen state
    expect(hataKodu(await geriDonus({ ...temel(), state: 'bilinmeyen' }))).toBe('suresi_doldu');

    // Review Focus 4: imza doğru (o mağazanın kendi secret'ı) ama shop davettekinden farklı
    expect(hataKodu(await geriDonus({ ...temel(), shop: BASKA }, BASKA_GIZLI))).toBe(
      'magaza_uyusmuyor',
    );
    await izYok(t1);

    // Kod token'a çevrilemedi → gecersiz, davet kullanılmadı
    tokenDurumu = 'red';
    expect(hataKodu(await geriDonus(temel()))).toBe('gecersiz');
    await izYok(t1);
    tokenDurumu = 'ok';

    // 31 dk eski state → süresi doldu
    await db
      .update(baglantiDavetleri)
      .set({ durumAt: new Date(Date.now() - 31 * 60_000) })
      .where(eq(baglantiDavetleri.token, t1));
    expect(hataKodu(await geriDonus(temel()))).toBe('suresi_doldu');
    await izYok(t1);
    // Eski davet uygulama adresinde de beklemiyor sayılır
    const eskiSayfa = await uygulama({ shop: MAGAZA, timestamp: zaman() });
    expect(eskiSayfa.status).toBe(200);

    // ikas davetinin state'i Shopify geri dönüşünde → mağaza uyuşmuyor
    const tIkas = await davetOlustur('ikas', 'dev-x');
    await onayla(tIkas);
    const ikasState = (await davetiOku(tIkas)).durumAnahtari!;
    expect(hataKodu(await geriDonus({ ...temel(), state: ikasState }))).toBe('magaza_uyusmuyor');
    expect(await baglantiyiOku()).toBeUndefined();

    // Başarısız geri dönüşlerin hiçbiri bildirim aboneliği kaydetmedi
    expect(abonelikler).toHaveLength(0);

    // --- Mutlu yol (ikas davetini iptal eden yeni Shopify daveti gibi: yeni state)
    const t2 = await davetOlustur('shopify', MAGAZA);
    await onayla(t2);
    const state2 = (await davetiOku(t2)).durumAnahtari!;
    const tamam = await geriDonus({ ...temel(), state: state2 });
    expect(tamam.status).toBe(302);
    expect(tamam.headers.get('location')).toBe(
      new URL('tamam/', env.KATILIM_SAYFASI_URL).toString(),
    );
    expect(tamam.headers.get('location')).toContain('/katil/tamam/');
    const b = await baglantiyiOku();
    expect(b?.platform).toBe('shopify');
    expect(b?.magazaAdi).toBe(MAGAZA);
    expect(b?.durum).toBe('aktif');
    expect(b?.tahsilat).toBe('deneme');
    expect(b?.onaylayanAd).toBe('Ayşe Deneme');
    expect(b?.iletisimEposta).toBe('butik@example.com');
    expect(b?.baglandiAt).not.toBeNull();
    expect(b?.kimlikSifreli).not.toContain(ERISIM);
    expect(b?.kimlikSifreli).not.toContain(YENILEME);
    const tokenlar = JSON.parse(coz(b!.kimlikSifreli, env.BAGLANTI_SIFRELEME_ANAHTARI!));
    expect(tokenlar.erisim).toBe(ERISIM);
    expect(tokenlar.yenileme).toBe(YENILEME);
    expect((await davetiOku(t2)).kullanildiAt).not.toBeNull();
    // Bildirim aboneliği arka planda bir kez kaydedilir (API origin'i + /katilim/shopify/bildirim)
    for (let i = 0; i < 100 && abonelikler.length === 0; i++) await Bun.sleep(10);
    expect(abonelikler).toEqual([
      {
        magaza: MAGAZA,
        uri: `${new URL(env.SHOPIFY_YONLENDIRME_URL).origin}/katilim/shopify/bildirim`,
      },
    ]);
    // Hoş geldin maili Shopify'a göre çıkış yolunu söyler
    expect(gidenMailler.length).toBe(1);
    expect(gidenMailler[0]!.alici).toBe('butik@example.com');
    expect(gidenMailler[0]!.text).toContain("Shopify'da Butika uygulamasını kaldırmanız yeterli");
    expect(gidenMailler[0]!.text).not.toContain('ikas');

    // Aynı state ikinci kez → süresi doldu, yeni abonelik yok
    expect(hataKodu(await geriDonus({ ...temel(), state: state2 }))).toBe('suresi_doldu');
    await Bun.sleep(50);
    expect(abonelikler).toHaveLength(1);

    // Uygulama adresi: bağlı → bağlantınız açık
    const bagli = await uygulama({ shop: MAGAZA, timestamp: zaman() });
    expect(bagli.status).toBe(200);
    const bagliMetin = await bagli.text();
    expect(bagliMetin).toContain('bağlantınız açık');
    expect(bagliMetin).toContain('Shopify&#39;da Butika uygulamasını kaldırmanız yeterli');

    // Hiçbir yanıtta token, kod ya da secret yok
    expect(yanitlar.length).toBeGreaterThan(15);
    for (const metin of yanitlar) {
      for (const gizli of [ERISIM, YENILEME, GIZLI, BASKA_GIZLI])
        expect(metin).not.toContain(gizli);
    }
  } finally {
    await db.delete(boutiques).where(eq(boutiques.id, butikId)); // cascade
    await db
      .delete(shopifyUygulamalari)
      .where(inArray(shopifyUygulamalari.magaza, [MAGAZA, BASKA]));
  }
});
