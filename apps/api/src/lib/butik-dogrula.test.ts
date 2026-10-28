import { describe, expect, test } from 'bun:test';
import { butikAdi, siteSinyalleri, siteyiDogrula } from './butik-dogrula';

const shopify = `<html><head><title>Love on Friday &ndash; Love on Friday</title>
<meta property="og:site_name" content="Love on Friday">
<meta property="og:description" content="Her parça özenle tasarlandı.">
<meta property="og:image" content="http://www.love-onfriday.com/cdn/shop/files/ceket.webp?v=1">
<script src="//cdn.shopify.com/s/files/x.js"></script></head>
<body><a href="/cart">Sepet</a><span class="price">4.250,00 TL</span><p>Yeni sezon elbiseler</p></body></html>`;

describe('siteSinyalleri', () => {
  test('Shopify butiği: ad, kapak (https), e-ticaret ve TL', () => {
    const s = siteSinyalleri(shopify, 'https://www.love-onfriday.com');
    expect(s.ad).toBe('Love on Friday');
    expect(s.kapak).toBe('https://www.love-onfriday.com/cdn/shop/files/ceket.webp?v=1');
    expect(s.platform).toBe('shopify');
    expect(s.eticaret).toBe(true);
    expect(s.tlFiyat).toBe(true);
    expect(s.toptan).toBe(false);
    expect(s.metin).toContain('Yeni sezon elbiseler');
  });

  test('göreli kapak adresi siteye göre tamamlanır, title yedeği kullanılır', () => {
    const s = siteSinyalleri(
      '<title>Mooi Butik | Anasayfa</title><meta content="/img/kapak.jpg" property="og:image">',
      'https://mooibutik.com',
    );
    expect(s.ad).toBe('Mooi Butik');
    expect(s.kapak).toBe('https://mooibutik.com/img/kapak.jpg');
    expect(s.eticaret).toBe(false);
  });

  test('toptancı ifadeleri Türkçe harflerle yakalanır', () => {
    expect(siteSinyalleri('<p>Toptancı fiyatları, minimum adet 6</p>', 'https://x.test').toptan).toBe(true);
    expect(siteSinyalleri('<p>Merter mağazamız</p>', 'https://x.test').toptan).toBe(true);
    // Tek "toptan" kelimesi reddettirmez, modele not olarak gider (perakende butikte "Toptan Satış" bağlantısı olur)
    expect(siteSinyalleri('<p>Toptancılara özel değil, perakende</p>', 'https://x.test').toptanKelime).toBe(1);
    expect(siteSinyalleri('<p>Toptancılara özel değil, perakende</p>', 'https://x.test').toptan).toBe(false);
    expect(siteSinyalleri('<p>İstoptanbul diye bir kelime yok</p>', 'https://x.test').toptan).toBe(false);
  });

  test('haber sitesi: e-ticaret izi yok', () => {
    const s = siteSinyalleri('<title>Haber</title><p>Son dakika gelişmeler</p>', 'https://haber.test');
    expect(s.eticaret).toBe(false);
    expect(s.tlFiyat).toBe(false);
  });
});

describe('siteyiDogrula', () => {
  const kategoriler = [{ id: 'k1', ad: 'Giyim' }];
  const sahte = (govde: string, durum = 200) =>
    Object.assign(async () => new Response(govde, { status: durum }), { blockedUntil: () => 0 });

  test('geçersiz adres ve http dışı şema reddedilir', async () => {
    expect(await siteyiDogrula('bir şey', kategoriler)).toEqual({ butik: false, neden: 'gecersiz_adres' });
    expect(await siteyiDogrula('ftp://x.test', kategoriler)).toEqual({ butik: false, neden: 'gecersiz_adres' });
    expect(await siteyiDogrula('https://vena.com.tr@kotu.test', kategoriler)).toEqual({
      butik: false,
      neden: 'gecersiz_adres',
    });
  });

  test('kurallardan geçemeyen siteler dil modeline gitmeden elenir', async () => {
    expect(await siteyiDogrula('https://x.test', kategoriler, { fetch: sahte('', 404) })).toEqual({
      butik: false,
      neden: 'site_404',
    });
    expect(await siteyiDogrula('https://x.test', kategoriler, { fetch: sahte('<p>blog</p>') })).toEqual({
      butik: false,
      neden: 'eticaret_degil',
    });
    expect(
      await siteyiDogrula('https://x.test', kategoriler, {
        fetch: sahte('<a href="/sepet">x</a> 100 TL Merter seri satış'),
      }),
    ).toEqual({ butik: false, neden: 'toptan' });
  });

  test('tek "Toptan Satış" bağlantısı reddettirmez, çok sık geçen toptan reddettirir', () => {
    const tekBaglanti = siteSinyalleri('<a href="/sepet">x</a> 100 TL <a href="/toptan">Whosale / Toptan Satış</a>', 'https://x.test');
    expect(tekBaglanti.toptan).toBe(false);
    expect(tekBaglanti.toptanKelime).toBe(2);
    expect(siteSinyalleri('<a href="/sepet">x</a> 100 TL toptan toptan toptan toptan', 'https://x.test').toptan).toBe(true);
  });

  test('platformu ve sepeti olmayan site görünür TL fiyatlarıyla e-ticaret sayılır', () => {
    const s = siteSinyalleri('<div>Elbise 599,90 ₺</div><div>Ceket 1.299 TL</div><div>Etek 450 TL</div>', 'https://x.test');
    expect(s.eticaret).toBe(true);
    expect(siteSinyalleri('<div>Elbise 599,90 ₺</div>', 'https://x.test').eticaret).toBe(false);
  });

  test('TL izi sayfanın 400 bininci karakterinden sonra da bulunur', () => {
    const s = siteSinyalleri(`<a href="/sepet">x</a>${' '.repeat(500_000)}"currency":"TRY"`, 'https://x.test');
    expect(s.tlFiyat).toBe(true);
  });

  test('kapak arama dev ve bozuk sayfada hızlı biter', () => {
    const kotu = `<a href="/sepet">x</a> 1 TL ${'<img class="logo logo logo '.repeat(20_000)}${'<img src="'.repeat(20_000)}`;
    const t = performance.now();
    siteSinyalleri(kotu, 'https://x.test');
    expect(performance.now() - t).toBeLessThan(500);
  });

  test('ağ hatası butik değil sayılır', async () => {
    const hata = Object.assign(
      async () => {
        throw new Error('ECONNREFUSED');
      },
      { blockedUntil: () => 0 },
    );
    expect(await siteyiDogrula('https://x.test', kategoriler, { fetch: hata })).toEqual({
      butik: false,
      neden: 'site_acilmadi',
    });
  });
});

describe('butikAdi', () => {
  test('alan adıyla örtüşen model adı kabul edilir (Türkçe harfler sadeleşir)', () => {
    expect(butikAdi('JR Little Baby', 'Yenidoğan, Hastane Çıkışı', 'jrlittlebaby.com')).toBe('JR Little Baby');
    expect(butikAdi('Şık Butik', null, 'sikbutik.com.tr')).toBe('Şık Butik');
  });
  test('başka markanın adı reddedilir: sitenin kendi adına, o da tutmazsa alan adına düşer', () => {
    expect(butikAdi('Zara', 'Rosece', 'rosece.com')).toBe('Rosece');
    expect(butikAdi('Zara', 'Kampanya!', 'rosece.com')).toBe('rosece.com');
    // Alt alan adlı site (27 Eki: en.betulsaday.com "en" sanılıyordu)
    expect(butikAdi('Betül Saday', 'Betül Saday Couture', 'en.betulsaday.com')).toBe('Betül Saday');
    expect(butikAdi(undefined, 'Betül Saday', 'en.betulsaday.com')).toBe('Betül Saday');
  });
});

test('site tarayıcı gibi okunur: accept ve accept-language gider (Shopify 403 almasın)', async () => {
  let giden: Headers | undefined;
  const yakala = (async (_adres: string | URL, init?: RequestInit) => {
    giden = new Headers(init?.headers);
    return new Response('', { status: 404 });
  }) as unknown as typeof import('./price-tracking/retailer-http').retailerFetch;
  await siteyiDogrula('https://x.test', [], { fetch: yakala });
  expect(giden?.get('accept')).toContain('text/html');
  expect(giden?.get('accept-language')).toContain('tr');
  expect(giden?.get('user-agent')).toContain('Chrome');
});

test('kapak bilgisi olmayan sitede ürün görseli, o da yoksa logo kapak olur', () => {
  const urunlu = `<html><head><title>Bircançil</title></head><body><a href="/sepet">Sepet</a> 1.299 TL
<img class="header_logo" src="https://cdn.test/logo.jpg">
<img class="productSliderImage" data-src="https://cdn.test/Uploads/UrunResimleri/thumb/elbise.jpg" src="/load.gif"></body></html>`;
  expect(siteSinyalleri(urunlu, 'https://x.test').kapak).toBe('https://cdn.test/Uploads/UrunResimleri/thumb/elbise.jpg');
  const logolu = `<html><body><a href="/sepet">Sepet</a> 1.299 TL
<img src="https://static.ticimax.cloud/1/Uploads/HeaderTasarim/logo.jpg" class="header_logo header-logo" alt=""></body></html>`;
  expect(siteSinyalleri(logolu, 'https://x.test').kapak).toBe('https://static.ticimax.cloud/1/Uploads/HeaderTasarim/logo.jpg');
});

test('büyük İ harfli sayfada etiket konumları kaymaz (logo kapak bulunur)', () => {
  const html = `<a href="/sepet">x</a> 1 TL <title>BİRCANCİL.COM</title>${'<p>İİİİ</p>'.repeat(2000)}<img src="https://cdn.test/logo.jpg" class="header_logo header-logo" alt="">`;
  expect(siteSinyalleri(html, 'https://x.test').kapak).toBe('https://cdn.test/logo.jpg');
});

test('sayfası sonradan yüklenen sitede sepet yazısı ve diğer altyapılar e-ticaret izi sayılır', () => {
  expect(siteSinyalleri('<button>Sepete Ekle</button>', 'https://x.test').eticaret).toBe(true);
  expect(siteSinyalleri('<script src="https://cdn3.kobisi.com/x.js"></script>', 'https://x.test').eticaret).toBe(true);
  expect(siteSinyalleri('<p>Son dakika haberleri</p>', 'https://x.test').eticaret).toBe(false);
});
