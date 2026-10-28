import { expect, spyOn, test } from 'bun:test';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Shopify bildirimleri (webhook): imza, sipariş, ürün, kaldırma, gizlilik istekleri ve
// bildirim aboneliği kaydı. Yalnız yerel butika_notification_test veritabanında; dosyayı
// tek başına çalıştırın. Shopify sahte (fikstür); gerçek mağazaya istek gitmez.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)(
  'shopify bildirimleri: imza, sipariş, ürün, kaldırma, gizlilik, abonelik',
  async () => {
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
    const ANAHTAR = randomBytes(32).toString('base64');
    process.env.BAGLANTI_SIFRELEME_ANAHTARI = ANAHTAR;
    const { env } = await import('../../../env');
    if (
      env.DATABASE_URL !== testUrl ||
      env.BAGLANTI_SIFRELEME_ANAHTARI !== ANAHTAR ||
      !env.BAGLANTI_KULLANILABILIR
    )
      throw new Error('Configuration was already loaded; run this test file separately');
    const { db } = await import('../../db');
    const { katilimRoutes, katilimBagimliliklari } = await import('../../../routes/katilim');
    const { shopifyBildirimleriniKaydet, SHOPIFY_BILDIRIM_KONULARI } = await import(
      './shopify-webhook'
    );
    const { baglantiSiparisleriniTara } = await import('../siparis-isle');
    const { yeniGonderimId } = await import('../kurallar');
    const { shopifyUygulamasiKaydet } = await import('./shopify-uygulamalari');
    const { sifrele } = await import('../../sifreleme');
    const { logger } = await import('../../logger');
    const { errorResponse } = await import('../../errors');
    const { Hono } = await import('hono');
    const { eq, inArray } = await import('drizzle-orm');
    const {
      baglantiUrunleri,
      boutiques,
      butikBaglantilari,
      butikSiparisleri,
      countries,
      gonderimler,
      shopifyUygulamalari,
      users,
    } = await import('@butika/db');
    const app = new Hono();
    app.route('/katilim', katilimRoutes);
    app.onError((err, c) => errorResponse(c, err));

    const hamFikstur = (ad: string) =>
      readFileSync(new URL(`./fixtures/${ad}.json`, import.meta.url), 'utf8');
    const fikstur = (ad: string) => JSON.parse(hamFikstur(ad));
    const tag = crypto.randomUUID().slice(0, 8);
    const gonderimId = yeniGonderimId();
    const MAGAZA_A = `bildirim-a-${tag}.myshopify.com`;
    const MAGAZA_B = `bildirim-b-${tag}.myshopify.com`;
    const GIZLI_A = `gizli-a-${tag}`;
    const GIZLI_B = `gizli-b-${tag}`;

    // Sipariş bildirimi fikstürü: kimlik Butika siparişininkiyle aynı; müşteri alanları sahte.
    const SIPARIS_GID = 'gid://shopify/Order/820982911946154508';
    const siparisBildirimi = hamFikstur('webhook-orders-updated');
    const kisiselIzler = [
      'musteri-gizli@example.com',
      'GizliAd',
      'GizliSoyad',
      'Gizli Sokak',
      '+905550001122',
      '203.0.113.77',
      '#9999',
    ];

    // Yeniden okunan sipariş: Butika fikstürü, gönderim kimliği bu teste ait.
    const butikaSiparisi = () => {
      const o = structuredClone(fikstur('siparis-butika').data.order);
      o.id = SIPARIS_GID;
      for (const z of [o.customerJourneySummary?.firstVisit, o.customerJourneySummary?.lastVisit])
        if (z?.utmParameters?.source === 'butika') z.utmParameters.content = gonderimId;
      return o;
    };
    let siparisSorgulari = 0;
    let siparisHatasi = false;
    const abonelikIstekleri: { query: string; variables: Record<string, any> }[] = [];
    let abonelikYaniti: 'ok' | 'alinmis' | 'hata' | 'ag' = 'ok';
    // Kaldırma doğrulaması: token hâlâ geçerli mi (shop sorgusu), iptal mi (401 + yenileme reddi)?
    let tokenDurumu: 'gecerli' | 'iptal' | 'gecici' = 'gecerli';
    // Doğrulama sırasında bağlantı yeniden kurulmuş gibi (yeni kimlik): koşullu kapanış eşleşmez.
    let dogrulamadaYenidenBaglan: (() => Promise<void>) | null = null;
    const dogrulamaTokenlari: string[] = [];
    let dogrulamaSorgulari = 0;
    let yenilemeIstekleri = 0;
    const sahteFetch = (async (girdi: string | URL | Request, init?: RequestInit) => {
      const adres = new URL(String(girdi instanceof Request ? girdi.url : girdi));
      if (![MAGAZA_A, MAGAZA_B].includes(adres.hostname))
        throw new Error(`beklenmeyen adres ${adres.hostname}`);
      if (adres.pathname === '/admin/oauth/access_token') {
        yenilemeIstekleri++;
        return Response.json({ error: 'invalid_request' }, { status: 400 });
      }
      if (!adres.pathname.endsWith('/graphql.json')) throw new TypeError('fetch failed');
      const govde = JSON.parse(String(init?.body));
      const query: string = govde.query;
      if (query.includes('webhookSubscriptionCreate')) {
        abonelikIstekleri.push(govde);
        if (abonelikYaniti === 'ag') throw new TypeError('fetch failed');
        const data: Record<string, unknown> = {};
        for (const [i] of SHOPIFY_BILDIRIM_KONULARI.entries()) {
          data[`k${i}`] =
            abonelikYaniti === 'ok'
              ? {
                  webhookSubscription: { id: `gid://shopify/WebhookSubscription/${i}` },
                  userErrors: [],
                }
              : abonelikYaniti === 'alinmis'
                ? {
                    webhookSubscription: null,
                    userErrors: [
                      {
                        field: ['webhookSubscription', 'uri'],
                        message: 'Address for this topic has already been taken',
                      },
                    ],
                  }
                : { webhookSubscription: null, userErrors: [{ field: null, message: 'Invalid' }] };
        }
        return Response.json({ data });
      }
      if (query.includes('shop {')) {
        dogrulamaSorgulari++;
        dogrulamaTokenlari.push(new Headers(init?.headers).get('x-shopify-access-token') ?? '');
        if (dogrulamadaYenidenBaglan) {
          await dogrulamadaYenidenBaglan();
          dogrulamadaYenidenBaglan = null;
        }
        if (tokenDurumu === 'iptal') return new Response('{}', { status: 401 });
        if (tokenDurumu === 'gecici') return new Response('hata', { status: 503 });
        return Response.json({ data: { shop: { id: 'gid://shopify/Shop/1' } } });
      }
      if (query.includes('order(id:')) {
        siparisSorgulari++;
        if (siparisHatasi) return new Response('hata', { status: 503 });
        expect(govde.variables.id).toBe(SIPARIS_GID);
        return Response.json({ data: { order: butikaSiparisi() } });
      }
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    katilimBagimliliklari.fetchFn = sahteFetch;

    const imza = (govde: string, secret: string) =>
      createHmac('sha256', secret).update(govde).digest('base64');
    const bildirim = async (
      konu: string,
      govde: string,
      o: { magaza?: string; secret?: string | null; tetik?: string } = {},
      // tetik: imzasız X-Shopify-Triggered-At; kararı etkilememeli.
    ) => {
      const magaza = o.magaza ?? MAGAZA_A;
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-shopify-topic': konu,
        'x-shopify-shop-domain': magaza,
        'x-shopify-api-version': '2026-10',
        'x-shopify-webhook-id': crypto.randomUUID(),
      };
      if (o.tetik) headers['x-shopify-triggered-at'] = o.tetik;
      if (o.secret !== null) headers['x-shopify-hmac-sha256'] = imza(govde, o.secret ?? GIZLI_A);
      return app.request('/katilim/shopify/bildirim', { method: 'POST', headers, body: govde });
    };

    const butikA = crypto.randomUUID();
    const butikB = crypto.randomUUID();
    const baglantiA = crypto.randomUUID();
    const baglantiB = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const BAGLANDI = new Date('2026-10-24T00:00:00Z');
    const gelecek = new Date(Date.now() + 3 * 3600_000).toISOString();
    const baglantiSatiri = (id: string, bid: string, magaza: string) => ({
      id,
      boutiqueId: bid,
      platform: 'shopify',
      magazaAdi: magaza,
      kimlikSifreli: sifrele(
        JSON.stringify({ erisim: `erisim-${tag}`, yenileme: `yenileme-${tag}`, bitisAt: gelecek }),
        ANAHTAR,
      ),
      durum: 'aktif',
      tahsilat: 'deneme',
      iletisimEposta: 'e@example.test',
      onaylayanAd: 'Test',
      sartlarSurumu: '2026-10-deneme',
      onayAt: new Date('2026-10-01T00:00:00Z'),
      baglandiAt: BAGLANDI,
      sonUrunEsitlemeAt: new Date(),
    });
    const urunSatiri = (baglantiId: string, boutiqueId: string, n: number) => ({
      baglantiId,
      boutiqueId,
      disUrunId: `u${n}`,
      disVaryantId: `v${n}`,
      ad: 'Ürün',
      url: `https://x.example/u${n}`,
      fiyatMinor: 1000,
      currency: 'USD',
      sonGorulmeAt: new Date(),
    });
    const baglantiOku = async (id = baglantiA) =>
      (await db.select().from(butikBaglantilari).where(eq(butikBaglantilari.id, id)))[0]!;
    const siparisler = async (id = baglantiA) =>
      db.select().from(butikSiparisleri).where(eq(butikSiparisleri.baglantiId, id));
    const urunler = async (id = baglantiA) =>
      db.select().from(baglantiUrunleri).where(eq(baglantiUrunleri.baglantiId, id));
    const anlikGoruntu = async () =>
      JSON.stringify({
        b: await db
          .select()
          .from(butikBaglantilari)
          .where(inArray(butikBaglantilari.id, [baglantiA, baglantiB])),
        s: await db
          .select()
          .from(butikSiparisleri)
          .where(inArray(butikSiparisleri.baglantiId, [baglantiA, baglantiB])),
        u: await db
          .select()
          .from(baglantiUrunleri)
          .where(inArray(baglantiUrunleri.baglantiId, [baglantiA, baglantiB])),
        k: await db
          .select()
          .from(shopifyUygulamalari)
          .where(inArray(shopifyUygulamalari.magaza, [MAGAZA_A, MAGAZA_B])),
      });

    const kayitlar = (['info', 'warn', 'error', 'debug'] as const).map((s) => spyOn(logger, s));
    try {
      await db
        .insert(countries)
        .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
        .onConflictDoNothing();
      await db.insert(boutiques).values(
        [butikA, butikB].map((id, i) => ({
          id,
          countryCode: 'TR',
          name: `Bildirim ${i}`,
          url: `https://bildirim-${id}.example`,
          coverImageUrl: '',
        })),
      );
      await db.insert(users).values({ id: userId, displayName: 'Bildirim Test' });
      await db
        .insert(gonderimler)
        .values({ id: gonderimId, userId, boutiqueId: butikA, url: 'https://e.com/u' });
      await db
        .insert(butikBaglantilari)
        .values([
          baglantiSatiri(baglantiA, butikA, MAGAZA_A),
          baglantiSatiri(baglantiB, butikB, MAGAZA_B),
        ]);
      await db
        .insert(baglantiUrunleri)
        .values([
          urunSatiri(baglantiA, butikA, 1),
          urunSatiri(baglantiA, butikA, 2),
          urunSatiri(baglantiB, butikB, 3),
        ]);
      await shopifyUygulamasiKaydet(MAGAZA_A, `cid-a-${tag}`, GIZLI_A);
      await shopifyUygulamasiKaydet(MAGAZA_B, `cid-b-${tag}`, GIZLI_B);

      // --- Bildirim aboneliği: beş konu tek istekte, adres API origin'i + /katilim/shopify/bildirim
      expect(await shopifyBildirimleriniKaydet(baglantiA, sahteFetch)).toBe(true);
      expect(abonelikIstekleri).toHaveLength(1);
      const kayit = abonelikIstekleri[0]!;
      const origin = new URL(env.SHOPIFY_YONLENDIRME_URL).origin;
      expect(
        Object.values(kayit.variables)
          .filter((v) => typeof v === 'string')
          .sort(),
      ).toEqual([
        'APP_UNINSTALLED',
        'ORDERS_CREATE',
        'ORDERS_UPDATED',
        'PRODUCTS_DELETE',
        'PRODUCTS_UPDATE',
      ]);
      expect(kayit.variables.abonelik).toEqual({
        uri: `${origin}/katilim/shopify/bildirim`,
        format: 'JSON',
      });
      // Yeniden bağlanmada zaten kayıtlı → yine true
      abonelikYaniti = 'alinmis';
      expect(await shopifyBildirimleriniKaydet(baglantiA, sahteFetch)).toBe(true);
      // Başka kullanıcı hatası → false; ağ hatası → false (fırlatmaz)
      abonelikYaniti = 'hata';
      expect(await shopifyBildirimleriniKaydet(baglantiA, sahteFetch)).toBe(false);
      abonelikYaniti = 'ag';
      expect(await shopifyBildirimleriniKaydet(baglantiA, sahteFetch)).toBe(false);
      // Bilinmeyen bağlantı → false
      expect(await shopifyBildirimleriniKaydet(crypto.randomUUID(), sahteFetch)).toBe(false);
      // Adres https değil (yerel) → istek gitmeden false
      abonelikYaniti = 'ok';
      const oncekiAdres = env.SHOPIFY_YONLENDIRME_URL;
      const oncekiSayi = abonelikIstekleri.length;
      env.SHOPIFY_YONLENDIRME_URL = 'http://localhost:3000/katilim/shopify/geri-donus';
      expect(await shopifyBildirimleriniKaydet(baglantiA, sahteFetch)).toBe(false);
      env.SHOPIFY_YONLENDIRME_URL = oncekiAdres;
      expect(abonelikIstekleri.length).toBe(oncekiSayi);

      // --- Review Focus 1: imza
      const once = await anlikGoruntu();
      // İmza yok → 401
      expect((await bildirim('orders/updated', siparisBildirimi, { secret: null })).status).toBe(
        401,
      );
      // Gövde A'nın secret'ıyla imzalı, başlık mağaza B → 401
      expect(
        (await bildirim('orders/updated', siparisBildirimi, { magaza: MAGAZA_B, secret: GIZLI_A }))
          .status,
      ).toBe(401);
      expect(
        (
          await bildirim('app/uninstalled', hamFikstur('webhook-app-uninstalled'), {
            magaza: MAGAZA_B,
            secret: GIZLI_A,
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await bildirim('shop/redact', hamFikstur('webhook-shop-redact'), {
            magaza: MAGAZA_B,
            secret: GIZLI_A,
          })
        ).status,
      ).toBe(401);
      // Yanlış secret, kayıtsız mağaza, biçim dışı / büyük harfli başlık → 401
      expect(
        (await bildirim('orders/updated', siparisBildirimi, { secret: 'yanlis' })).status,
      ).toBe(401);
      expect(
        (await bildirim('orders/updated', siparisBildirimi, { magaza: `yok-${tag}.myshopify.com` }))
          .status,
      ).toBe(401);
      expect(
        (await bildirim('orders/updated', siparisBildirimi, { magaza: 'evil.com' })).status,
      ).toBe(401);
      expect(
        (await bildirim('orders/updated', siparisBildirimi, { magaza: MAGAZA_A.toUpperCase() }))
          .status,
      ).toBe(401);
      // İmzalı gövde değiştirilmiş → 401
      const r401 = await app.request('/katilim/shopify/bildirim', {
        method: 'POST',
        headers: {
          'x-shopify-topic': 'app/uninstalled',
          'x-shopify-shop-domain': MAGAZA_A,
          'x-shopify-hmac-sha256': imza('{"a":1}', GIZLI_A),
        },
        body: '{"a":2}',
      });
      expect(r401.status).toBe(401);
      expect(siparisSorgulari).toBe(0);
      expect(await anlikGoruntu()).toBe(once);

      // --- orders/updated: doğru imza → sipariş yeniden okunur, satır yazılır; kişisel veri yok
      const r1 = await bildirim('orders/updated', siparisBildirimi);
      expect(r1.status).toBe(200);
      expect(siparisSorgulari).toBe(1);
      const s1 = await siparisler();
      expect(s1).toHaveLength(1);
      expect(s1[0]!.disSiparisId).toBe(SIPARIS_GID);
      expect(s1[0]!.gonderimId).toBe(gonderimId);
      expect(s1[0]!.tutarMinor).toBe(2495);
      // orders/create da aynı yoldan
      expect((await bildirim('orders/create', siparisBildirimi)).status).toBe(200);
      expect(siparisSorgulari).toBe(2);
      expect(await siparisler()).toHaveLength(1);
      // Shopify geçici hata → 500 (Shopify yeniden dener)
      siparisHatasi = true;
      expect((await bildirim('orders/updated', siparisBildirimi)).status).toBe(500);
      siparisHatasi = false;
      // Sipariş kimliği yok → 200, sorgu yok
      const onceki = siparisSorgulari;
      expect((await bildirim('orders/updated', '{"name":"#1"}')).status).toBe(200);
      expect(siparisSorgulari).toBe(onceki);

      // --- products/update ve products/delete → sonUrunEsitlemeAt null
      expect((await baglantiOku()).sonUrunEsitlemeAt).not.toBeNull();
      expect((await bildirim('products/update', '{"id":632910392}')).status).toBe(200);
      expect((await baglantiOku()).sonUrunEsitlemeAt).toBeNull();
      await db
        .update(butikBaglantilari)
        .set({ sonUrunEsitlemeAt: new Date() })
        .where(eq(butikBaglantilari.id, baglantiA));
      expect((await bildirim('products/delete', '{"id":632910392}')).status).toBe(200);
      expect((await baglantiOku()).sonUrunEsitlemeAt).toBeNull();
      // B'nin bağlantısı etkilenmedi
      expect((await baglantiOku(baglantiB)).sonUrunEsitlemeAt).not.toBeNull();

      // --- Gizlilik: customers/data_request ve customers/redact → 200, hiçbir tablo değişmez
      const onceGizlilik = await anlikGoruntu();
      const redact = hamFikstur('webhook-customers-redact');
      const veriIstegi = JSON.stringify({
        shop_id: 954889,
        shop_domain: MAGAZA_A,
        orders_requested: [299938],
        customer: { id: 191167, email: 'musteri-gizli@example.com', phone: '+905550001122' },
        data_request: { id: 9999 },
      });
      expect((await bildirim('customers/redact', redact)).status).toBe(200);
      expect((await bildirim('customers/data_request', veriIstegi)).status).toBe(200);
      expect(await anlikGoruntu()).toBe(onceGizlilik);
      // Bilinmeyen konu → 200, değişiklik yok
      expect((await bildirim('carts/create', '{}')).status).toBe(200);
      expect(await anlikGoruntu()).toBe(onceGizlilik);

      // Gövdeler: mağaza kimliği başlıktakiyle aynı olmalı (fikstürdeki alan değiştirilir).
      const kaldirmaGovdesi = (m: string) =>
        JSON.stringify({ ...fikstur('webhook-app-uninstalled'), myshopify_domain: m });
      const redactGovdesi = (m: string) =>
        JSON.stringify({ ...fikstur('webhook-shop-redact'), shop_domain: m });
      const kaldirma = kaldirmaGovdesi(MAGAZA_A);
      const onceTekrar = await anlikGoruntu();
      const kimlikA = (await baglantiOku()).kimlikSifreli;

      // --- Konu değiştirme: imzalı customers/redact gövdesi app/uninstalled ya da shop/redact
      // konusuyla → hiçbir şey kapanmaz/silinmez
      expect((await bildirim('app/uninstalled', redact)).status).toBe(401);
      const redactA = JSON.stringify({
        ...fikstur('webhook-customers-redact'),
        shop_domain: MAGAZA_A,
      });
      expect((await bildirim('app/uninstalled', redactA)).status).toBe(401);
      // customers/redact gövdesinde shop_domain doğru; ama token canlı → silinmez
      expect((await bildirim('shop/redact', redactA)).status).toBe(200);
      expect(await anlikGoruntu()).toBe(onceTekrar);
      // Mağaza kimliği uyuşmuyor → 401; gövde nesne değil → 400; ikisi de değişiklik yok
      expect((await bildirim('app/uninstalled', kaldirmaGovdesi(MAGAZA_B))).status).toBe(401);
      expect((await bildirim('shop/redact', redactGovdesi(MAGAZA_B))).status).toBe(401);
      expect((await bildirim('app/uninstalled', 'json-degil')).status).toBe(400);
      expect((await bildirim('shop/redact', '[1]')).status).toBe(400);
      // myshopify_domain yoksa yalnız .myshopify.com ile biten domain kabul edilir
      expect(
        (await bildirim('app/uninstalled', JSON.stringify({ id: 1, domain: 'butik.example.com' })))
          .status,
      ).toBe(401);
      expect(await anlikGoruntu()).toBe(onceTekrar);

      // --- Tekrar oynatma: imzalı kaldırma gövdesi, token Shopify'da hâlâ geçerli → kapanmaz.
      // Doğrulama tek ham istek, kayıtlı token'la, yenileme yok.
      const dogrulamaBas = dogrulamaSorgulari;
      expect(
        (await bildirim('app/uninstalled', kaldirma, { tetik: new Date().toISOString() })).status,
      ).toBe(200);
      expect(dogrulamaSorgulari).toBe(dogrulamaBas + 1);
      expect(dogrulamaTokenlari.at(-1)).toBe(`erisim-${tag}`);
      expect((await baglantiOku()).durum).toBe('aktif');
      // shop/redact de aynı kapıdan: canlı token → silinmez
      expect((await bildirim('shop/redact', redactGovdesi(MAGAZA_A))).status).toBe(200);
      expect(await anlikGoruntu()).toBe(onceTekrar);
      // Geçici Shopify hatası → 500, değişiklik yok
      tokenDurumu = 'gecici';
      expect((await bildirim('app/uninstalled', kaldirma)).status).toBe(500);
      expect(await anlikGoruntu()).toBe(onceTekrar);
      // Kayıtlı token'ın süresi dolmuş → istek göndermeden 500, değişiklik yok
      tokenDurumu = 'iptal';
      const suresiDolmus = sifrele(
        JSON.stringify({
          erisim: `erisim-${tag}`,
          yenileme: `yenileme-${tag}`,
          bitisAt: new Date(Date.now() - 60_000).toISOString(),
        }),
        ANAHTAR,
      );
      await db
        .update(butikBaglantilari)
        .set({ kimlikSifreli: suresiDolmus })
        .where(eq(butikBaglantilari.id, baglantiA));
      const onceDolmus = await anlikGoruntu();
      const sorguDolmus = dogrulamaSorgulari;
      expect((await bildirim('app/uninstalled', kaldirma)).status).toBe(500);
      expect((await bildirim('shop/redact', redactGovdesi(MAGAZA_A))).status).toBe(500);
      expect(dogrulamaSorgulari).toBe(sorguDolmus);
      expect(await anlikGoruntu()).toBe(onceDolmus);
      await db
        .update(butikBaglantilari)
        .set({ kimlikSifreli: kimlikA })
        .where(eq(butikBaglantilari.id, baglantiA));
      // Doğrulama sırasında yeniden bağlandı (kimlik değişti) → koşullu kapanış eşleşmez, 500
      const yeniKimlik = sifrele(
        JSON.stringify({ erisim: `yeni-${tag}`, yenileme: null, bitisAt: null }),
        ANAHTAR,
      );
      dogrulamadaYenidenBaglan = async () => {
        await db
          .update(butikBaglantilari)
          .set({ kimlikSifreli: yeniKimlik })
          .where(eq(butikBaglantilari.id, baglantiA));
      };
      expect((await bildirim('app/uninstalled', kaldirma)).status).toBe(500);
      expect((await baglantiOku()).durum).toBe('aktif');
      expect((await baglantiOku()).kimlikSifreli).toBe(yeniKimlik);
      expect((await urunler()).every((u) => u.aktif)).toBe(true);
      await db
        .update(butikBaglantilari)
        .set({ kimlikSifreli: kimlikA })
        .where(eq(butikBaglantilari.id, baglantiA));

      // --- Gerçek kaldırma: kayıtlı token 401 → kapali, kimlik silinir, ürünler pasif; tetik
      // başlığı kararı etkilemez; yenileme denenmez. İki kez → ikisi de 200.
      expect(
        (await bildirim('app/uninstalled', kaldirma, { tetik: '2020-01-01T00:00:00Z' })).status,
      ).toBe(200);
      expect(yenilemeIstekleri).toBe(0);
      const kapali = await baglantiOku();
      expect(kapali.durum).toBe('kapali');
      expect(kapali.kimlikSifreli).toBe('');
      expect((await urunler()).every((u) => !u.aktif)).toBe(true);
      expect((await urunler()).length).toBe(2);
      const dogrulamaOnce = dogrulamaSorgulari;
      expect((await bildirim('app/uninstalled', kaldirma)).status).toBe(200);
      expect((await baglantiOku()).durum).toBe('kapali');
      // Zaten kapalı: Shopify'a sorgu yok
      expect(dogrulamaSorgulari).toBe(dogrulamaOnce);
      // B etkilenmedi
      expect((await baglantiOku(baglantiB)).durum).toBe('aktif');
      expect((await urunler(baglantiB)).every((u) => u.aktif)).toBe(true);

      // --- Review Focus 3: kaldırmadan sonra gecikmiş orders/updated → 200, sipariş değişmez
      const siparisOnce = JSON.stringify(await siparisler());
      const sorguOnce = siparisSorgulari;
      expect((await bildirim('orders/updated', siparisBildirimi)).status).toBe(200);
      expect(siparisSorgulari).toBe(sorguOnce);
      expect(JSON.stringify(await siparisler())).toBe(siparisOnce);
      // Süren/sonraki tarama da yazmaz
      expect(await baglantiSiparisleriniTara(baglantiA, { fetchFn: sahteFetch })).toBe('atlandi');
      expect(JSON.stringify(await siparisler())).toBe(siparisOnce);
      // Kapalı bağlantıda ürün bildirimi eşitlemeyi tetiklemez
      await db
        .update(butikBaglantilari)
        .set({ sonUrunEsitlemeAt: new Date() })
        .where(eq(butikBaglantilari.id, baglantiA));
      expect((await bildirim('products/update', '{"id":1}')).status).toBe(200);
      expect((await baglantiOku()).sonUrunEsitlemeAt).not.toBeNull();

      // --- shop/redact kapalı bağlantıda: ürün satırları ve anahtar kaydı silinir, sipariş kalır
      const sorguRedact = dogrulamaSorgulari;
      expect((await bildirim('shop/redact', redactGovdesi(MAGAZA_A))).status).toBe(200);
      expect(dogrulamaSorgulari).toBe(sorguRedact);
      expect(await urunler()).toHaveLength(0);
      expect(
        await db.select().from(shopifyUygulamalari).where(eq(shopifyUygulamalari.magaza, MAGAZA_A)),
      ).toHaveLength(0);
      expect(await siparisler()).toHaveLength(1);
      expect((await baglantiOku()).kimlikSifreli).toBe('');
      // B'nin anahtarı ve ürünleri yerinde
      expect(await urunler(baglantiB)).toHaveLength(1);
      expect(
        await db.select().from(shopifyUygulamalari).where(eq(shopifyUygulamalari.magaza, MAGAZA_B)),
      ).toHaveLength(1);

      // --- customers/* imza geçerliyken her gövdede 200 (B mağazası, kendi secret'ı)
      const b = { magaza: MAGAZA_B, secret: GIZLI_B };
      expect((await bildirim('customers/redact', 'json-degil', b)).status).toBe(200);
      expect((await bildirim('customers/data_request', '[1,2]', b)).status).toBe(200);
      expect(
        (
          await bildirim(
            'customers/redact',
            JSON.stringify({ shop_id: 1, shop_domain: MAGAZA_B }),
            b,
          )
        ).status,
      ).toBe(200);
      // Diğer konularda imzalı ama nesne olmayan gövde → 400
      expect((await bildirim('orders/updated', 'json-degil', b)).status).toBe(400);
      expect((await bildirim('shop/redact', 'json-degil', b)).status).toBe(400);
      expect(await urunler(baglantiB)).toHaveLength(1);
      // B canlı (token 200) → shop/redact silmez
      tokenDurumu = 'gecerli';
      expect((await bildirim('shop/redact', redactGovdesi(MAGAZA_B), b)).status).toBe(200);
      expect(await urunler(baglantiB)).toHaveLength(1);
      // B'nin token'ı iptal (401) → shop/redact bağlantıyı kapatır, siler
      tokenDurumu = 'iptal';
      expect((await bildirim('shop/redact', redactGovdesi(MAGAZA_B), b)).status).toBe(200);
      expect(await urunler(baglantiB)).toHaveLength(0);
      expect((await baglantiOku(baglantiB)).durum).toBe('kapali');
      expect((await baglantiOku(baglantiB)).kimlikSifreli).toBe('');
      expect(
        await db.select().from(shopifyUygulamalari).where(eq(shopifyUygulamalari.magaza, MAGAZA_B)),
      ).toHaveLength(0);

      // --- Kişisel veri ve gizli değer hiçbir tabloda ve logda yok
      const tablolar = await anlikGoruntu();
      const loglar = JSON.stringify(kayitlar.flatMap((k) => k.mock.calls));
      for (const iz of [...kisiselIzler, GIZLI_A, GIZLI_B, `erisim-${tag}`]) {
        expect(tablolar).not.toContain(iz);
        expect(loglar).not.toContain(iz);
      }
    } finally {
      for (const k of kayitlar) k.mockRestore();
      await db.delete(users).where(eq(users.id, userId));
      for (const id of [butikA, butikB]) await db.delete(boutiques).where(eq(boutiques.id, id));
      await db
        .delete(shopifyUygulamalari)
        .where(inArray(shopifyUygulamalari.magaza, [MAGAZA_A, MAGAZA_B]));
    }
  },
  60_000,
);
