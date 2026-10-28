import { expect, spyOn, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Shopify bağlantısı platformdan bağımsız akışlarda: ürün eşitleme, iade politikası, sipariş
// tarama (atıf, komisyon, hazır olmayan atıf), yetki kaybı, kişisel veri/başka sipariş izi yok.
// Yalnız yerel butika_notification_test veritabanında; dosyayı tek başına çalıştırın.
// Shopify sahte (fikstür); gerçek mağazaya istek gitmez.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)(
  'shopify kaynağı: ürünler, iade, sipariş tarama, hazır olmayan atıf, yetki kaybı, iz yok',
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
    const { baglantiyiEsitle } = await import('../urun-esitleme');
    const { baglantiSiparisleriniTara } = await import('../siparis-isle');
    const { komisyonHesapla, yeniGonderimId } = await import('../kurallar');
    const { shopifyUygulamasiKaydet } = await import('./shopify-uygulamalari');
    const { sifrele } = await import('../../sifreleme');
    const { logger } = await import('../../logger');
    const { eq } = await import('drizzle-orm');
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

    const fikstur = (ad: string) =>
      JSON.parse(readFileSync(new URL(`./fixtures/${ad}.json`, import.meta.url), 'utf8')).data;
    const URUNLER = fikstur('urunler');
    const POLITIKALAR = fikstur('politikalar');
    const tag = crypto.randomUUID().slice(0, 8);
    const gonderimId = yeniGonderimId();
    const MAGAZA = `kaynak-a-${tag}.myshopify.com`;
    const MAGAZA_YETKI = `kaynak-b-${tag}.myshopify.com`;
    const GIZLI_AD = '#GIZLI-7731';

    /** Fikstürdeki sipariş; kimlik, ad ve Butika gönderim kimliği değiştirilebilir. */
    const siparis = (ad: string, id: string, degis: { name?: string; ready?: boolean } = {}) => {
      const o = structuredClone(fikstur(ad).order);
      o.id = id;
      if (degis.name) o.name = degis.name;
      for (const z of [o.customerJourneySummary?.firstVisit, o.customerJourneySummary?.lastVisit])
        if (z?.utmParameters?.source === 'butika') z.utmParameters.content = gonderimId;
      return o;
    };
    const siparisler: Record<string, any>[] = [];
    let urunSorgulari = 0;
    let tokenIstekleri = 0;
    const sahteFetch = (async (girdi: string | URL | Request, init?: RequestInit) => {
      const adres = new URL(String(girdi instanceof Request ? girdi.url : girdi));
      const magaza = adres.hostname;
      if (magaza === MAGAZA_YETKI) {
        if (adres.pathname.endsWith('/oauth/access_token')) tokenIstekleri++;
        return new Response('{}', { status: 401 });
      }
      if (magaza !== MAGAZA) throw new Error(`beklenmeyen mağaza ${magaza}`);
      if (!adres.pathname.endsWith('/graphql.json')) throw new Error(`adres ${adres}`);
      const { query } = JSON.parse(String(init?.body));
      let data: any;
      if (query.includes('shopPolicies')) data = POLITIKALAR;
      else if (query.includes('products(')) {
        urunSorgulari++;
        data = structuredClone(URUNLER);
        data.products.pageInfo = { hasNextPage: false, endCursor: null };
      } else if (query.includes('orders(')) {
        data = {
          orders: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: structuredClone(siparisler),
          },
        };
      } else throw new Error('beklenmeyen sorgu');
      return Response.json({ data });
    }) as unknown as typeof fetch;

    const butikId = crypto.randomUUID();
    const yetkiButikId = crypto.randomUUID();
    const baglantiId = crypto.randomUUID();
    const yetkiBaglantiId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const BAGLANDI = new Date('2026-10-24T00:00:00Z');
    const gelecek = new Date(Date.now() + 3 * 3600_000).toISOString();
    const baglantiSatiri = (id: string, bid: string, magaza: string) => ({
      id,
      boutiqueId: bid,
      platform: 'shopify',
      magazaAdi: magaza,
      kimlikSifreli: sifrele(
        JSON.stringify({ erisim: 'eski-erisim', yenileme: 'eski-yenileme', bitisAt: gelecek }),
        ANAHTAR,
      ),
      durum: 'aktif',
      tahsilat: 'deneme',
      iletisimEposta: 'e@example.test',
      onaylayanAd: 'Test',
      sartlarSurumu: '2026-10-deneme',
      onayAt: new Date('2026-10-01T00:00:00Z'),
      baglandiAt: BAGLANDI,
    });
    const baglantiOku = async (id = baglantiId) =>
      (await db.select().from(butikBaglantilari).where(eq(butikBaglantilari.id, id)))[0]!;
    const sipSatirlari = async (id = baglantiId) =>
      db.select().from(butikSiparisleri).where(eq(butikSiparisleri.baglantiId, id));

    const kayitlar = (['info', 'warn', 'error', 'debug'] as const).map((s) => spyOn(logger, s));
    try {
      await db
        .insert(countries)
        .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
        .onConflictDoNothing();
      await db.insert(boutiques).values(
        [butikId, yetkiButikId].map((id, i) => ({
          id,
          countryCode: 'TR',
          name: `Kaynak ${i}`,
          url: `https://kaynak-${id}.example`,
          coverImageUrl: '',
        })),
      );
      await db.insert(users).values({ id: userId, displayName: 'Kaynak Test' });
      await db
        .insert(gonderimler)
        .values({ id: gonderimId, userId, boutiqueId: butikId, url: 'https://e.com/u' });
      await db
        .insert(butikBaglantilari)
        .values([
          baglantiSatiri(baglantiId, butikId, MAGAZA),
          baglantiSatiri(yetkiBaglantiId, yetkiButikId, MAGAZA_YETKI),
        ]);
      await shopifyUygulamasiKaydet(MAGAZA, 'cid-a', 'secret-a');
      await shopifyUygulamasiKaydet(MAGAZA_YETKI, 'cid-b', 'secret-b');

      // 1) Ürün eşitleme: her varyant bir satır; iade politikası dolar.
      const s1 = await baglantiyiEsitle(baglantiId, {
        fetchFn: sahteFetch,
        simdi: new Date('2026-10-25T09:00:00Z'),
      });
      expect(urunSorgulari).toBe(1);
      expect(s1.eklenen).toBeGreaterThan(0);
      expect(s1.dusen).toBe(0);
      const urunSatirlari = await db
        .select()
        .from(baglantiUrunleri)
        .where(eq(baglantiUrunleri.baglantiId, baglantiId));
      expect(urunSatirlari).toHaveLength(s1.eklenen);
      expect(urunSatirlari.every((s) => s.aktif && s.boutiqueId === butikId)).toBe(true);
      const b1 = await baglantiOku();
      expect(b1.iadePolitikasi).toBeTruthy();
      expect(b1.sonHata).toBeNull();
      expect(b1.durum).toBe('aktif');

      // 2) Hazır olmayan Butika siparişi: yazılmaz, tarama tamam; ayrıca doğrudan sipariş yazılmaz.
      const butika = siparis('siparis-butika', 'gid://shopify/Order/1001');
      const hazirDegil = siparis('siparis-butika-hazir-degil', 'gid://shopify/Order/1001');
      siparisler.push(hazirDegil, siparis('siparis-dogrudan', 'gid://shopify/Order/1002'));
      const simdi1 = new Date('2026-10-25T10:00:00Z');
      expect(await baglantiSiparisleriniTara(baglantiId, { fetchFn: sahteFetch, simdi: simdi1 })).toBe(
        'tamam',
      );
      expect(await sipSatirlari()).toHaveLength(0);

      // 3) Bir saat sonra, updatedAt aynı: atıf hazır → satır ve %10 komisyon; doğrudan hâlâ yok.
      siparisler.splice(0, 1, butika);
      const simdi2 = new Date(simdi1.getTime() + 3600_000);
      expect(await baglantiSiparisleriniTara(baglantiId, { fetchFn: sahteFetch, simdi: simdi2 })).toBe(
        'tamam',
      );
      const satirlar = await sipSatirlari();
      expect(satirlar).toHaveLength(1);
      const r = satirlar[0]!;
      expect(r.disSiparisId).toBe('gid://shopify/Order/1001');
      expect(r.gonderimId).toBe(gonderimId);
      expect(r.userId).toBe(userId);
      expect(r.boutiqueId).toBe(butikId);
      expect(r.odendi).toBe(true);
      expect(r.tutarMinor).toBe(2495);
      expect(r.komisyonMinor).toBe(komisyonHesapla(2495));
      expect(r.komisyonAt).not.toBeNull();

      // 4) Butika'nın olmayan sipariş: tabloda ve loglarda adı geçmez.
      siparisler.push(siparis('siparis-dogrudan', 'gid://shopify/Order/1003', { name: GIZLI_AD }));
      await baglantiSiparisleriniTara(baglantiId, {
        fetchFn: sahteFetch,
        simdi: new Date(simdi2.getTime() + 3600_000),
      });
      expect(await sipSatirlari()).toHaveLength(1);
      expect(JSON.stringify(await sipSatirlari())).not.toContain(GIZLI_AD);
      expect(JSON.stringify(kayitlar.flatMap((k) => k.mock.calls))).not.toContain(GIZLI_AD);

      // 5) Token yenilenmesi aktif bağlantıya şifreli yazılır; 401 iki kez: bağlantı koptu, ürünler pasif.
      await db
        .insert(baglantiUrunleri)
        .values({
          baglantiId: yetkiBaglantiId,
          boutiqueId: yetkiButikId,
          disUrunId: 'u1',
          disVaryantId: 'v1',
          ad: 'Ürün',
          url: 'https://x.example/u',
          fiyatMinor: 1000,
          currency: 'USD',
          sonGorulmeAt: new Date(),
        });
      const s5 = await baglantiyiEsitle(yetkiBaglantiId, { fetchFn: sahteFetch });
      expect(s5.dusen).toBe(1);
      expect(tokenIstekleri).toBe(1);
      const b5 = await baglantiOku(yetkiBaglantiId);
      expect(b5.durum).toBe('koptu');
      const aktifler = (
        await db
          .select()
          .from(baglantiUrunleri)
          .where(eq(baglantiUrunleri.baglantiId, yetkiBaglantiId))
      ).filter((x) => x.aktif);
      expect(aktifler).toHaveLength(0);

      // 6) Kimlik bozuksa (anahtar kaydı yok) eşitleme hata yazar, fırlatmaz.
      await db.delete(shopifyUygulamalari).where(eq(shopifyUygulamalari.magaza, MAGAZA));
      expect(
        await baglantiyiEsitle(baglantiId, { fetchFn: sahteFetch, simdi: new Date() }),
      ).toEqual({ eklenen: 0, guncellenen: 0, dusen: 0 });
      expect((await baglantiOku()).sonHata).toBe('kimlik_okunamadi');
    } finally {
      for (const k of kayitlar) k.mockRestore();
      await db.delete(users).where(eq(users.id, userId));
      for (const id of [butikId, yetkiButikId]) await db.delete(boutiques).where(eq(boutiques.id, id));
      for (const m of [MAGAZA, MAGAZA_YETKI])
        await db.delete(shopifyUygulamalari).where(eq(shopifyUygulamalari.magaza, m));
    }
  },
  60_000,
);
