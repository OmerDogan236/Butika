import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Bağlı butiğin ürün eşitlemesi. Yalnız ayrı, yerel ve adı butika_notification_test ile
// başlayan veritabanında; dosyayı tek başına çalıştırın. ikas sahte (fikstür).
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)(
  'ürün eşitleme: ilk tur, düşenler, fiyat değişimi, geçici hata, yetki kaybı',
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
    process.env.IKAS_CLIENT_ID = 'test-istemci';
    process.env.IKAS_CLIENT_SECRET = 'test-gizli';
    const { env } = await import('../../env');
    if (env.DATABASE_URL !== testUrl || env.BAGLANTI_SIFRELEME_ANAHTARI !== ANAHTAR)
      throw new Error('Configuration was already loaded; run this test file separately');
    const { db } = await import('../db');
    const { baglantiyiEsitle } = await import('./urun-esitleme');
    const { bekleyenBaglantilariEsitle } = await import('./urun-esitleme-job');
    const { SAYFA_BOYUTU } = await import('./ikas/ikas-urun');
    const { coz, sifrele } = await import('../sifreleme');
    const { and, eq, isNull, lt, or } = await import('drizzle-orm');
    const { boutiques, butikBaglantilari, baglantiUrunleri, countries } = await import(
      '@butika/db'
    );

    const fikstur = JSON.parse(
      readFileSync(new URL('./ikas/fixtures/urunler.json', import.meta.url), 'utf8'),
    );
    const hepsi: any[] = fikstur.data.listProduct.data;
    const satirSayisi = (urunler: any[]) =>
      urunler.reduce(
        (t, u) =>
          t +
          (u.deleted
            ? 0
            : (u.variants ?? []).filter(
                (v: any) => v.isActive !== false && v.prices?.[0]?.sellPrice != null,
              ).length),
        0,
      );
    // Fikstürde tek varyantlı ürün yok: çıkarılınca düşecek satır sayısı o ürünün geçerli varyantlarıdır.
    const cikarilacak = hepsi.find((u) => satirSayisi([u]) > 0);
    const cikanSatir = satirSayisi([cikarilacak]);
    expect(cikarilacak).toBeTruthy();

    // --- sahte ikas ---
    let urunler: any[] = structuredClone(hepsi);
    let mod: 'normal' | 'ikinci-sayfa-hata' | 'yetki' = 'normal';
    let tokenIstegi = 0;
    let aradaKapat: (() => Promise<void>) | null = null;
    const sahteFetch = (async (girdi: string | URL | Request, init?: RequestInit) => {
      const adres = String(girdi instanceof Request ? girdi.url : girdi);
      if (adres.includes('/oauth/token')) {
        tokenIstegi++;
        return new Response(
          JSON.stringify({
            access_token: 'yeni-erisim',
            refresh_token: 'yeni-yenileme',
            expires_in: 14400,
          }),
          { status: 200 },
        );
      }
      if (aradaKapat && JSON.parse(String(init?.body)).query.includes('listProduct')) {
        const f = aradaKapat;
        aradaKapat = null;
        await f();
      }
      if (mod === 'yetki') return new Response('{}', { status: 401 });
      const { query, variables } = JSON.parse(String(init?.body));
      let data: unknown;
      if (query.includes('getMerchant')) data = { getMerchant: { id: 'm1', storeName: 'dev-x' } };
      else if (query.includes('listStorefront'))
        data = { listStorefront: [{ routings: [{ domain: 'magaza.example.com' }] }] };
      else {
        if (mod === 'ikinci-sayfa-hata' && variables.page >= 2) throw new Error('ag koptu');
        const bas = (variables.page - 1) * SAYFA_BOYUTU;
        data = {
          listProduct: { count: urunler.length, data: urunler.slice(bas, bas + SAYFA_BOYUTU) },
        };
      }
      return new Response(JSON.stringify({ data }), { status: 200 });
    }) as unknown as typeof fetch;

    const butikId = crypto.randomUUID();
    const baglantiId = crypto.randomUUID();
    const ikinciButikId = crypto.randomUUID();
    const ikinciBaglantiId = crypto.randomUUID();
    const bozukButikId = crypto.randomUUID();
    const bozukBaglantiId = crypto.randomUUID();
    const gelecek = new Date(Date.now() + 3 * 3600_000).toISOString();
    const baglantiSatiri = (id: string, bid: string, ad: string) => ({
      id,
      boutiqueId: bid,
      platform: 'ikas',
      magazaAdi: ad,
      kimlikSifreli: sifrele(
        JSON.stringify({ erisim: 'eski', yenileme: 'eski-y', bitisAt: gelecek }),
        ANAHTAR,
      ),
      durum: 'aktif',
      tahsilat: 'deneme',
      iletisimEposta: 'e@example.test',
      onaylayanAd: 'Test',
      sartlarSurumu: '2026-10-deneme',
      onayAt: new Date('2026-10-01T00:00:00Z'),
      iadePolitikasi: 'elle girilen iade metni',
    });
    const satirlar = async (id = baglantiId) =>
      db.select().from(baglantiUrunleri).where(eq(baglantiUrunleri.baglantiId, id));
    const baglantiOku = async (id = baglantiId) =>
      (await db.select().from(butikBaglantilari).where(eq(butikBaglantilari.id, id)))[0]!;

    try {
      await db
        .insert(countries)
        .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
        .onConflictDoNothing();
      await db.insert(boutiques).values(
        [butikId, ikinciButikId, bozukButikId].map((id, i) => ({
          id,
          countryCode: 'TR',
          name: `Esitleme ${i}`,
          url: `https://esitleme-${id}.example`,
          coverImageUrl: '',
        })),
      );
      await db
        .insert(butikBaglantilari)
        .values([
          baglantiSatiri(baglantiId, butikId, 'dev-x'),
          baglantiSatiri(ikinciBaglantiId, ikinciButikId, 'dev-y'),
          { ...baglantiSatiri(bozukBaglantiId, bozukButikId, 'dev-z'), kimlikSifreli: 'bozuk' },
        ]);

      // 1) İlk eşitleme: her varyant bir satır, adresler normalleşmiş, elle iade metni korunur.
      const n = satirSayisi(hepsi);
      const simdi1 = new Date('2026-10-23T10:00:00Z');
      const s1 = await baglantiyiEsitle(baglantiId, { fetchFn: sahteFetch, simdi: simdi1 });
      expect(s1).toEqual({ eklenen: n, guncellenen: 0, dusen: 0 });
      const ilk = await satirlar();
      expect(ilk).toHaveLength(n);
      expect(ilk.every((s) => s.aktif && s.sonGorulmeAt.getTime() === simdi1.getTime())).toBe(true);
      expect(ilk.every((s) => s.boutiqueId === butikId && s.url === new URL(s.url).href)).toBe(
        true,
      );
      const b1 = await baglantiOku();
      expect(b1.sonUrunEsitlemeAt?.getTime()).toBe(simdi1.getTime());
      expect(b1.iadePolitikasi).toBe('elle girilen iade metni');
      expect(b1.sonHata).toBeNull();

      // 2) Aynı veriyle tekrar: değişiklik yok.
      const simdi2 = new Date('2026-10-23T14:00:00Z');
      expect(await baglantiyiEsitle(baglantiId, { fetchFn: sahteFetch, simdi: simdi2 })).toEqual({
        eklenen: 0,
        guncellenen: 0,
        dusen: 0,
      });

      // 3) Bir ürün mağazadan çıkar: o satır pasifleşir; ötekiler aktif kalır.
      urunler = urunler.filter((u) => u.id !== cikarilacak.id);
      const s3 = await baglantiyiEsitle(baglantiId, {
        fetchFn: sahteFetch,
        simdi: new Date('2026-10-23T18:00:00Z'),
      });
      expect(s3).toEqual({ eklenen: 0, guncellenen: 0, dusen: cikanSatir });
      const dusenSatirlar = (await satirlar()).filter((s) => s.disUrunId === cikarilacak.id);
      expect(dusenSatirlar).toHaveLength(cikanSatir);
      expect(dusenSatirlar.every((s) => !s.aktif)).toBe(true);
      expect((await satirlar()).filter((s) => s.aktif)).toHaveLength(n - cikanSatir);

      // 4) Fiyat değişir + düşen ürün geri gelir: bir fiyat güncellemesi + geri gelen satırlar.
      urunler = structuredClone(hepsi);
      const degisen = urunler.find(
        (u) =>
          u.id !== cikarilacak.id &&
          !u.deleted &&
          u.variants?.[0]?.isActive !== false &&
          u.variants?.[0]?.prices?.[0]?.sellPrice != null,
      );
      const degisenVaryant = degisen.variants[0];
      const eskiFiyat = degisenVaryant.prices[0].sellPrice;
      degisenVaryant.prices[0].sellPrice = eskiFiyat + 12.5;
      const s4 = await baglantiyiEsitle(baglantiId, {
        fetchFn: sahteFetch,
        simdi: new Date('2026-10-23T22:00:00Z'),
      });
      expect(s4).toEqual({ eklenen: 0, guncellenen: cikanSatir + 1, dusen: 0 });
      const guncel = (await satirlar()).find((s) => s.disVaryantId === degisenVaryant.id)!;
      expect(guncel.fiyatMinor).toBe(Math.round((eskiFiyat + 12.5) * 100));
      expect((await satirlar()).every((s) => s.aktif)).toBe(true);
      expect(await satirlar()).toHaveLength(n);

      // 4b) ikas boş liste döndürür (tur eksiksiz): satırlar korunur, sonHata yazılır, tarih ilerlemez.
      urunler = [];
      const s4b = await baglantiyiEsitle(baglantiId, {
        fetchFn: sahteFetch,
        simdi: new Date('2026-10-24T00:00:00Z'),
      });
      expect(s4b).toEqual({ eklenen: 0, guncellenen: 0, dusen: 0 });
      const b4b = await baglantiOku();
      expect(b4b.sonHata).toBe('bos_urun_listesi');
      expect(b4b.durum).toBe('aktif');
      expect(b4b.sonUrunEsitlemeAt?.toISOString()).toBe('2026-10-23T22:00:00.000Z');
      expect((await satirlar()).filter((x) => x.aktif)).toHaveLength(n);

      // 5) Geçici hata (ikinci sayfa): yarım turda görülmeyen ürün düşürülmez, durum aynı, fırlatmaz.
      const dolgu = Array.from({ length: SAYFA_BOYUTU }, (_, i) => {
        const k = structuredClone(
          hepsi.find((u) => !u.deleted && u.id !== cikarilacak.id && u.variants?.length),
        );
        k.id = `dolgu-${i}`;
        k.variants = k.variants.map((v: any, j: number) => ({ ...v, id: `dolgu-${i}-${j}` }));
        return k;
      });
      urunler = dolgu; // ilk sayfa tam dolu, cikarilacak yok; ikinci sayfa ağ hatası
      mod = 'ikinci-sayfa-hata';
      const onceAktif = (await satirlar()).filter((s) => s.aktif).length;
      const s5 = await baglantiyiEsitle(baglantiId, {
        fetchFn: sahteFetch,
        simdi: new Date('2026-10-24T02:00:00Z'),
      });
      expect(s5.dusen).toBe(0);
      const b5 = await baglantiOku();
      expect(b5.durum).toBe('aktif');
      expect(b5.sonHata).toContain('ikas_gecici');
      expect(b5.sonUrunEsitlemeAt?.toISOString()).toBe('2026-10-23T22:00:00.000Z');
      const sonra = await satirlar();
      expect(sonra.filter((s) => s.aktif).length).toBeGreaterThanOrEqual(onceAktif);
      expect(sonra.filter((s) => s.disUrunId === cikarilacak.id).every((s) => s.aktif)).toBe(true);

      // 6) İş: bozuk kimlikli bağlantı hata verse de sıradakiler eşitlenir; sayı tam.
      mod = 'normal';
      urunler = structuredClone(hepsi);
      const isSimdi = new Date('2026-10-24T06:00:00Z');
      const beklenen = await db
        .select({ id: butikBaglantilari.id })
        .from(butikBaglantilari)
        .where(
          and(
            eq(butikBaglantilari.durum, 'aktif'),
            or(
              isNull(butikBaglantilari.sonUrunEsitlemeAt),
              lt(butikBaglantilari.sonUrunEsitlemeAt, new Date(isSimdi.getTime() - 4 * 3600_000)),
            ),
          ),
        );
      expect(beklenen.map((x) => x.id).sort()).toEqual(
        expect.arrayContaining([baglantiId, ikinciBaglantiId, bozukBaglantiId].sort()),
      );
      expect(await bekleyenBaglantilariEsitle(isSimdi, sahteFetch)).toBe(beklenen.length);
      expect(await satirlar(ikinciBaglantiId)).toHaveLength(n);
      expect((await baglantiOku(ikinciBaglantiId)).sonHata).toBeNull();
      expect((await baglantiOku(bozukBaglantiId)).sonHata).toBe('kimlik_okunamadi');
      // Hemen ardından: eşitlenenler vadesi gelmediği, bozuk olan bekleme süresinde olduğu için 0.
      expect(
        await bekleyenBaglantilariEsitle(new Date(isSimdi.getTime() + 60_000), sahteFetch),
      ).toBe(0);

      // 6b) Aynı bağlantıda eşzamanlı iki çağrı: biri 'atlandi' döner.
      const eszamanli = await Promise.all([
        baglantiyiEsitle(ikinciBaglantiId, {
          fetchFn: sahteFetch,
          simdi: new Date('2026-10-24T07:00:00Z'),
        }),
        baglantiyiEsitle(ikinciBaglantiId, {
          fetchFn: sahteFetch,
          simdi: new Date('2026-10-24T07:00:00Z'),
        }),
      ]);
      expect(eszamanli.filter((x) => x.atlandi)).toHaveLength(1);
      expect(eszamanli.find((x) => x.atlandi)).toEqual({
        eklenen: 0,
        guncellenen: 0,
        dusen: 0,
        atlandi: true,
      });

      // 6c) Eşitleme sürerken bağlantı kapanır: satırlar pasifleşir, tarih ilerlemez.
      const oncekiTarih = (await baglantiOku(ikinciBaglantiId)).sonUrunEsitlemeAt?.getTime();
      aradaKapat = async () => {
        await db
          .update(butikBaglantilari)
          .set({ durum: 'kapali' })
          .where(eq(butikBaglantilari.id, ikinciBaglantiId));
      };
      const s6c = await baglantiyiEsitle(ikinciBaglantiId, {
        fetchFn: sahteFetch,
        simdi: new Date('2026-10-24T08:00:00Z'),
      });
      expect(s6c.dusen).toBe(n);
      expect((await satirlar(ikinciBaglantiId)).every((x) => !x.aktif)).toBe(true);
      expect((await baglantiOku(ikinciBaglantiId)).sonUrunEsitlemeAt?.getTime()).toBe(oncekiTarih);

      // 7) ikas iki kez 401: token yenilenir, yine reddedilir → koptu, ürünler pasif, hata fırlatmaz.
      mod = 'yetki';
      const s7 = await baglantiyiEsitle(baglantiId, {
        fetchFn: sahteFetch,
        simdi: new Date('2026-10-24T07:00:00Z'),
      });
      expect(s7.dusen).toBeGreaterThan(0);
      const b7 = await baglantiOku();
      expect(b7.durum).toBe('koptu');
      expect(b7.sonHata).toBe('ikas_yetki_reddedildi');
      expect((await satirlar()).every((s) => !s.aktif)).toBe(true);
      // Yenilenen token çifti şifreli yazıldı.
      expect(tokenIstegi).toBeGreaterThan(0);
      expect(JSON.parse(coz(b7.kimlikSifreli, ANAHTAR)).erisim).toBe('yeni-erisim');
      // Kopmuş bağlantı bir daha eşitlenmez.
      mod = 'normal';
      expect(await baglantiyiEsitle(baglantiId, { fetchFn: sahteFetch })).toEqual({
        eklenen: 0,
        guncellenen: 0,
        dusen: 0,
      });
    } finally {
      await db.delete(boutiques).where(eq(boutiques.id, butikId));
      await db.delete(boutiques).where(eq(boutiques.id, ikinciButikId));
      await db.delete(boutiques).where(eq(boutiques.id, bozukButikId));
    }
  },
  60_000,
);
