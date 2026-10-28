import { expect, test } from 'bun:test';

// Bağlı butikte kayıtlı ürünün fiyatı ve stoğu bağlantı verisinden okunur; siteye
// istek atılmaz. Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan
// veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('bağlı butikte fiyat ve stok bağlantıdan, bağlı olmayanda siteden', async () => {
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
  const { db } = await import('../db');
  const { baglantiFiyatiBul } = await import('./baglanti-fiyat-kaynagi');
  const { resolveProductPrice } = await import('../price-tracking/price-source-router');
  const { inArray } = await import('drizzle-orm');
  const { countries, boutiques, butikBaglantilari, baglantiUrunleri } = await import('@butika/db');

  const id = () => crypto.randomUUID();
  const butik = { bagli: id(), koptu: id(), eski: id(), yok: id() };
  const baglanti = { bagli: id(), koptu: id(), eski: id() };
  const saatOnce = (sa: number) => new Date(Date.now() - sa * 3600_000);
  const host = `lujo-${butik.bagli.slice(0, 8)}.example`;
  const urunId = id(), varyantM = id(), varyantL = id(), ceketId = id();
  const baglantiSatiri = (k: keyof typeof baglanti, durum: string, sonUrunEsitlemeAt: Date | null = new Date()) => ({
    id: baglanti[k], boutiqueId: butik[k], platform: 'ikas', magazaAdi: k, kimlikSifreli: 'x', durum,
    tahsilat: 'deneme', iletisimEposta: `${k}@example.test`, onaylayanAd: 'Test',
    sartlarSurumu: '2026-10-deneme', onayAt: new Date('2026-10-01T00:00:00Z'), sonUrunEsitlemeAt,
  });
  const urun = (ek: Record<string, unknown>) => ({
    baglantiId: baglanti.bagli, boutiqueId: butik.bagli, disUrunId: id(), disVaryantId: null,
    url: `https://${host}/urun`, fiyatMinor: 100000, indirimliFiyatMinor: null, currency: 'TRY',
    stokta: true, aktif: true, sonGorulmeAt: new Date(), ...ek,
  });

  const gercekFetch = globalThis.fetch;
  const siteIstekleri: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    siteIstekleri.push(String(input instanceof Request ? input.url : input));
    return new Response('<html></html>', { status: 404 });
  }) as typeof fetch;

  try {
    await db.insert(countries).values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' }).onConflictDoNothing();
    await db.insert(boutiques).values((Object.keys(butik) as (keyof typeof butik)[]).map((k) => ({
      id: butik[k], countryCode: 'TR', name: `Fiyat ${k}`, url: `https://${k}-${butik[k]}.example`, coverImageUrl: '',
    })));
    await db.insert(butikBaglantilari).values([
      baglantiSatiri('bagli', 'aktif'), baglantiSatiri('koptu', 'koptu'),
      // Aktif ama 13 saattir eşitlenmemiş.
      baglantiSatiri('eski', 'aktif', saatOnce(13)),
    ]);
    await db.insert(baglantiUrunleri).values([
      // Ürün düzeyi satır, indirimli fiyatı var.
      urun({ url: `https://${host}/elbise`, fiyatMinor: 200000, indirimliFiyatMinor: 150000 }),
      // Aynı URL'de iki varyant (ürün düzeyi satır yok).
      urun({ url: `https://${host}/gomlek/`, disUrunId: urunId, disVaryantId: varyantM, fiyatMinor: 90000, stokta: false }),
      urun({ url: `https://${host}/gomlek/`, disUrunId: urunId, disVaryantId: varyantL, fiyatMinor: 95000, stokta: true }),
      // Tek varyantlı URL.
      urun({ url: `https://${host}/etek`, disVaryantId: id(), fiyatMinor: 70000, stokta: false }),
      // Mağazadan kalkmış ürün.
      urun({ url: `https://${host}/eski`, aktif: false }),
      // İki varyant, ikisi de tükenmiş; biri indirimde.
      urun({ url: `https://${host}/ceket`, disUrunId: ceketId, disVaryantId: id(), fiyatMinor: 100000, indirimliFiyatMinor: 60000, stokta: false }),
      urun({ url: `https://${host}/ceket`, disUrunId: ceketId, disVaryantId: id(), fiyatMinor: 80000, stokta: false }),
      // Bağlantı taze ama bu satır 13 saattir görülmedi.
      urun({ url: `https://${host}/bayat`, sonGorulmeAt: saatOnce(13) }),
      // Eşitlemesi eskimiş bağlantının satırı.
      urun({ baglantiId: baglanti.eski, boutiqueId: butik.eski, url: `https://${host}/eski-baglanti` }),
      // Bağlantısı kopmuş butiğin satırı.
      urun({ baglantiId: baglanti.koptu, boutiqueId: butik.koptu, url: `https://${host}/koptu` }),
    ]);

    // URL sorgu, hash, www, büyük harf host ve sondaki / farkı tanınmaz.
    expect(await baglantiFiyatiBul(butik.bagli, `https://www.${host.toUpperCase()}/elbise/?utm_source=x#foto`))
      .toEqual({ fiyatMinor: 150000, currency: 'TRY', stokta: true });
    // Seçili beden: varyant kimliğiyle eşleşir.
    expect(await baglantiFiyatiBul(butik.bagli, `https://${host}/gomlek?_butika_variant=ikas:${urunId}:${varyantM}`))
      .toEqual({ fiyatMinor: 90000, currency: 'TRY', stokta: false });
    expect(await baglantiFiyatiBul(butik.bagli, `https://${host}/gomlek?_butika_variant=ikas:${urunId}:${varyantL}`))
      .toEqual({ fiyatMinor: 95000, currency: 'TRY', stokta: true });
    // Başka ürünün kimliği ya da bilinmeyen varyant: eşleşme yok.
    expect(await baglantiFiyatiBul(butik.bagli, `https://${host}/gomlek?_butika_variant=ikas:${id()}:${varyantM}`)).toBeNull();
    expect(await baglantiFiyatiBul(butik.bagli, `https://${host}/gomlek?_butika_variant=ikas:${urunId}:${id()}`)).toBeNull();
    // Beden seçilmemiş, iki varyant: en düşük fiyat, bir beden bile stoktaysa stokta.
    expect(await baglantiFiyatiBul(butik.bagli, `https://${host}/gomlek`))
      .toEqual({ fiyatMinor: 90000, currency: 'TRY', stokta: true });
    // En düşük fiyat indirimli fiyatla karşılaştırılır; hiçbiri stokta değilse tükenmiş.
    expect(await baglantiFiyatiBul(butik.bagli, `https://${host}/ceket`))
      .toEqual({ fiyatMinor: 60000, currency: 'TRY', stokta: false });
    // Tek varyant varsa o kullanılır.
    expect(await baglantiFiyatiBul(butik.bagli, `https://${host}/etek`))
      .toEqual({ fiyatMinor: 70000, currency: 'TRY', stokta: false });
    expect(await baglantiFiyatiBul(butik.bagli, `https://${host}/eski`)).toBeNull();
    expect(await baglantiFiyatiBul(butik.bagli, `https://${host}/olmayan`)).toBeNull();
    // Aktif olmayan bağlantı, 12 saatten eski eşitleme ya da 12 saattir görülmeyen satır
    // veri kaynağı değildir: yönlendirici siteye döner.
    expect(await baglantiFiyatiBul(butik.koptu, `https://${host}/koptu`)).toBe('kapsam_disi');
    expect(await baglantiFiyatiBul(butik.eski, `https://${host}/eski-baglanti`)).toBe('kapsam_disi');
    expect(await baglantiFiyatiBul(butik.bagli, `https://${host}/bayat`)).toBe('kapsam_disi');

    // Yönlendirici: bağlı butik + eşleşen ürün → bağlantı fiyatı, siteye istek yok.
    const bulunan = await resolveProductPrice({ url: `https://${host}/elbise`, boutiqueId: butik.bagli, expectedCurrency: 'TRY' });
    expect(bulunan.status).toBe('success');
    if (bulunan.status === 'success') {
      expect(bulunan.observation).toMatchObject({ priceMinor: 150000, currency: 'TRY', availability: 'in_stock', provider: 'baglanti' });
    }
    const tukenen = await resolveProductPrice({ url: `https://${host}/gomlek?_butika_variant=ikas:${urunId}:${varyantM}`, boutiqueId: butik.bagli });
    expect(tukenen.status === 'success' && tukenen.observation.availability).toBe('out_of_stock');
    // Bağlı butik + eşleşmeyen ürün → gözlem yok, yine siteye istek yok.
    const bulunmayan = await resolveProductPrice({ url: `https://${host}/olmayan`, boutiqueId: butik.bagli });
    expect(bulunmayan).toMatchObject({ status: 'failed', reason: 'not_found' });
    expect(siteIstekleri).toEqual([]);

    // Eski bağlantı verisi gözlem sayılmaz: mevcut sağlayıcılar siteye gider.
    await resolveProductPrice({ url: `https://${host}/eski-baglanti`, boutiqueId: butik.eski });
    expect(siteIstekleri.length).toBeGreaterThan(0);
    siteIstekleri.length = 0;
    await resolveProductPrice({ url: `https://${host}/bayat`, boutiqueId: butik.bagli });
    expect(siteIstekleri.length).toBeGreaterThan(0);
    siteIstekleri.length = 0;

    // Bağlı olmayan ya da bağlantısı kopmuş butik → mevcut sağlayıcılar siteye gider.
    await resolveProductPrice({ url: `https://${host}/koptu`, boutiqueId: butik.koptu });
    expect(siteIstekleri.length).toBeGreaterThan(0);
    siteIstekleri.length = 0;
    await resolveProductPrice({ url: `https://${host}/elbise`, boutiqueId: butik.yok });
    expect(siteIstekleri.length).toBeGreaterThan(0);
    siteIstekleri.length = 0;
    await resolveProductPrice({ url: `https://${host}/elbise` });
    expect(siteIstekleri.length).toBeGreaterThan(0);
  } finally {
    globalThis.fetch = gercekFetch;
    await db.delete(boutiques).where(inArray(boutiques.id, Object.values(butik)));
  }
});
