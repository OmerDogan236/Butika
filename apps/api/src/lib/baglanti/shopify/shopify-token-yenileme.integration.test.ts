import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';

// Shopify token yenilemesi bağlantı başına tek: aynı anda iki istemci (saatlik tarama, ürün
// eşitleme, webhook) yenileme token'ını iki kez harcamaz; başka süreç yenilemişse onun çifti
// benimsenir; kapalı bağlantıya yeni çift yazılmaz.
// Yalnız yerel butika_notification_test veritabanında; dosyayı tek başına çalıştırın.
// Shopify sahte; gerçek mağazaya istek gitmez.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)(
  'shopify token yenileme: eşzamanlı tek yenileme, başka sürecin çifti benimsenir, kapalıya yazılmaz',
  async () => {
    const url = new URL(testUrl!);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !url.pathname.startsWith('/butika_notification_test')
    ) {
      throw new Error('A dedicated local butika_notification_test database is required');
    }
    process.env.DATABASE_URL = testUrl;
    const ANAHTAR = randomBytes(32).toString('base64');
    process.env.BAGLANTI_SIFRELEME_ANAHTARI = ANAHTAR;
    const { env } = await import('../../../env');
    if (env.DATABASE_URL !== testUrl || env.BAGLANTI_SIFRELEME_ANAHTARI !== ANAHTAR)
      throw new Error('Configuration was already loaded; run this test file separately');
    const { db } = await import('../../db');
    const { shopifyBaglantiIstemcisi } = await import('../baglanti-istemcisi');
    const { shopifyUygulamasiKaydet } = await import('./shopify-uygulamalari');
    const { coz, sifrele } = await import('../../sifreleme');
    const { eq } = await import('drizzle-orm');
    const { boutiques, butikBaglantilari, countries, shopifyUygulamalari } = await import(
      '@butika/db'
    );

    const tag = crypto.randomUUID().slice(0, 8);
    const MAGAZA = `yenileme-${tag}.myshopify.com`;
    const MAGAZA_K = `yenileme-k-${tag}.myshopify.com`;
    const butikId = crypto.randomUUID();
    const baglantiId = crypto.randomUUID();
    const kapaliButikId = crypto.randomUUID();
    const kapaliBaglantiId = crypto.randomUUID();

    // Sahte Shopify: yenileme token'ı tek kullanımlık (döndürülür); yalnız güncel erişim token'ı geçer.
    let gecerliYenileme = `YNL-0-${tag}`;
    let gecerliErisim = `ERS-0-${tag}`;
    let sira = 0;
    let tokenIstekleri = 0;
    let reddedilenYenileme = 0;
    /** Token ucuna istek gelince, cevaptan önce "başka süreç" olarak çalışır. */
    let araya: (() => Promise<void>) | null = null;
    const sahteFetch = (async (girdi: string | URL | Request, init?: RequestInit) => {
      const adres = new URL(String(girdi instanceof Request ? girdi.url : girdi));
      if (adres.hostname !== MAGAZA && adres.hostname !== MAGAZA_K)
        throw new Error(`beklenmeyen mağaza ${adres.hostname}`);
      if (adres.pathname.endsWith('/admin/oauth/access_token')) {
        tokenIstekleri++;
        const govde = JSON.parse(String(init?.body));
        await Bun.sleep(150); // eşzamanlı istemciler gerçekten üst üste binsin
        if (araya) await araya();
        if (govde.refresh_token !== gecerliYenileme) {
          reddedilenYenileme++;
          return Response.json({ error: 'invalid_grant' }, { status: 400 });
        }
        sira++;
        gecerliYenileme = `YNL-${sira}-${tag}`;
        gecerliErisim = `ERS-${sira}-${tag}`;
        return Response.json({
          access_token: gecerliErisim,
          refresh_token: gecerliYenileme,
          expires_in: 3599,
        });
      }
      if (!adres.pathname.endsWith('/graphql.json')) throw new Error(`adres ${adres}`);
      const yetki = new Headers(init?.headers).get('x-shopify-access-token');
      if (yetki !== gecerliErisim) return new Response('{}', { status: 401 });
      return Response.json({ data: { shop: { name: 'x' } } });
    }) as unknown as typeof fetch;

    const yakinBitis = () => new Date(Date.now() + 60_000).toISOString();
    const kimlik = (erisim: string, yenileme: string, bitisAt: string) =>
      sifrele(JSON.stringify({ erisim, yenileme, bitisAt }), ANAHTAR);
    const satir = (
      id: string,
      bid: string,
      durum: string,
      kimlikSifreli: string,
      magaza = MAGAZA,
    ) => ({
      id,
      boutiqueId: bid,
      platform: 'shopify',
      magazaAdi: magaza,
      kimlikSifreli,
      durum,
      tahsilat: 'deneme',
      iletisimEposta: 'e@example.test',
      onaylayanAd: 'Test',
      sartlarSurumu: '2026-10-deneme',
      onayAt: new Date('2026-10-01T00:00:00Z'),
      baglandiAt: new Date('2026-10-24T00:00:00Z'),
    });
    const oku = async (id: string) =>
      (await db.select().from(butikBaglantilari).where(eq(butikBaglantilari.id, id)))[0]!;
    const sorgu = 'query { shop { name } }';

    try {
      await db
        .insert(countries)
        .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
        .onConflictDoNothing();
      await db.insert(boutiques).values(
        [butikId, kapaliButikId].map((id, i) => ({
          id,
          countryCode: 'TR',
          name: `Yenileme ${i}`,
          url: `https://yenileme-${id}.example`,
          coverImageUrl: '',
        })),
      );
      const ilkKimlik = kimlik(gecerliErisim, gecerliYenileme, yakinBitis());
      await db.insert(butikBaglantilari).values(satir(baglantiId, butikId, 'aktif', ilkKimlik));
      await shopifyUygulamasiKaydet(MAGAZA, 'cid-y', 'secret-y');
      await shopifyUygulamasiKaydet(MAGAZA_K, 'cid-k', 'secret-k');

      // 1) Aynı satırdan kurulan iki istemci, bitişe 1 dk kala aynı anda sorgular: tek yenileme.
      const ilkSatir = await oku(baglantiId);
      const a = await shopifyBaglantiIstemcisi(ilkSatir, sahteFetch);
      const b = await shopifyBaglantiIstemcisi(ilkSatir, sahteFetch);
      expect(a && b).toBeTruthy();
      const sonuclar = await Promise.all([a!.sorgu(sorgu), b!.sorgu(sorgu)]);
      expect(sonuclar).toEqual([{ shop: { name: 'x' } }, { shop: { name: 'x' } }]);
      expect(tokenIstekleri).toBe(1);
      expect(reddedilenYenileme).toBe(0);
      const s1 = await oku(baglantiId);
      expect(s1.durum).toBe('aktif');
      expect(s1.sonHata).toBeNull();
      const t1 = JSON.parse(coz(s1.kimlikSifreli!, ANAHTAR));
      expect(t1.erisim).toBe(`ERS-1-${tag}`);
      expect(t1.yenileme).toBe(`YNL-1-${tag}`);
      // Satırda düz metin token yok.
      for (const gizli of [`ERS-1-${tag}`, `YNL-1-${tag}`, `ERS-0-${tag}`, `YNL-0-${tag}`])
        expect(JSON.stringify(s1)).not.toContain(gizli);

      // 2) Eski kopyayla (başka süreç çoktan yenilemiş) kurulan istemci: eski erişim 401, eski
      //    yenileme token'ı Shopify'da reddedilir; DB'deki yeni çift benimsenir, bağlantı kopmaz.
      const c = await shopifyBaglantiIstemcisi({ ...s1, kimlikSifreli: ilkKimlik }, sahteFetch);
      expect(await c!.sorgu<unknown>(sorgu)).toEqual({ shop: { name: 'x' } });
      expect(tokenIstekleri).toBe(1);
      expect((await oku(baglantiId)).durum).toBe('aktif');

      // 2b) Kilit dışından yazan bir süreç (ör. yeniden bağlanma) yenileme token'ını tam bu sırada
      //     tüketip yeni çifti DB'ye yazsın: ağ yenilemesi reddedilir ama DB yeniden okunur ve
      //     yeni çiftle tekrar denenir; yetki kaybı sayılmaz.
      const s2 = await oku(baglantiId);
      const d = await shopifyBaglantiIstemcisi(
        { ...s2, kimlikSifreli: kimlik(gecerliErisim, gecerliYenileme, yakinBitis()) },
        sahteFetch,
      );
      araya = async () => {
        sira++;
        gecerliYenileme = `YNL-${sira}-${tag}`;
        gecerliErisim = `ERS-${sira}-${tag}`;
        await db
          .update(butikBaglantilari)
          .set({
            kimlikSifreli: kimlik(
              gecerliErisim,
              gecerliYenileme,
              new Date(Date.now() + 3600_000).toISOString(),
            ),
          })
          .where(eq(butikBaglantilari.id, baglantiId));
      };
      // DB d'nin elindekiyle aynı olsun ki kilit altında benimseme değil ağ yenilemesi denensin.
      await db
        .update(butikBaglantilari)
        .set({ kimlikSifreli: kimlik(gecerliErisim, gecerliYenileme, yakinBitis()) })
        .where(eq(butikBaglantilari.id, baglantiId));
      const oncekiRed = reddedilenYenileme;
      expect(await d!.sorgu<unknown>(sorgu)).toEqual({ shop: { name: 'x' } });
      expect(reddedilenYenileme).toBe(oncekiRed + 1);
      expect((await oku(baglantiId)).durum).toBe('aktif');
      araya = null;

      // 3) Kapalı bağlantıda yenileme olsa da yeni çift yazılmaz.
      gecerliYenileme = `YNL-K-${tag}`;
      gecerliErisim = `ERS-K-${tag}`;
      const kapaliKimlik = kimlik(gecerliErisim, gecerliYenileme, yakinBitis());
      await db
        .insert(butikBaglantilari)
        .values(satir(kapaliBaglantiId, kapaliButikId, 'kapali', kapaliKimlik, MAGAZA_K));
      const k = await shopifyBaglantiIstemcisi(await oku(kapaliBaglantiId), sahteFetch);
      const oncekiIstek = tokenIstekleri;
      await k!.sorgu(sorgu).catch(() => null);
      expect(tokenIstekleri).toBe(oncekiIstek + 1);
      const ks = await oku(kapaliBaglantiId);
      expect(ks.kimlikSifreli).toBe(kapaliKimlik);
      expect(ks.durum).toBe('kapali');
    } finally {
      for (const id of [baglantiId, kapaliBaglantiId])
        await db.delete(butikBaglantilari).where(eq(butikBaglantilari.id, id));
      for (const id of [butikId, kapaliButikId])
        await db.delete(boutiques).where(eq(boutiques.id, id));
      for (const m of [MAGAZA, MAGAZA_K])
        await db.delete(shopifyUygulamalari).where(eq(shopifyUygulamalari.magaza, m));
    }
  },
  30_000,
);
