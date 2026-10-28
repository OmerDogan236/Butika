import { describe, expect, test } from 'bun:test';
import { fiyatKurus, urunBilgisi, urunSayfasiOku } from './urun-sayfasi';

describe('fiyatKurus', () => {
  test('Türkçe ve İngilizce yazımlar', () => {
    expect(fiyatKurus('1.299,90')).toBe(129990);
    expect(fiyatKurus('1299.90')).toBe(129990);
    expect(fiyatKurus('1,299.90')).toBe(129990);
    expect(fiyatKurus('4.250 TL')).toBe(425000); // tek ayraç + üçlü grup = binlik
    expect(fiyatKurus('12,500')).toBe(1250000);
    expect(fiyatKurus('349,90')).toBe(34990);
    expect(fiyatKurus('49.5')).toBe(4950);
    expect(fiyatKurus(349)).toBe(34900);
    expect(fiyatKurus('')).toBeNull();
    expect(fiyatKurus(null)).toBeNull();
  });
});

describe('urunBilgisi', () => {
  test('JSON-LD Product: ad, görsel, fiyat, para birimi', () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product",
      "name":"Saten Midi Elbise","image":["//cdn.butik.test/elbise.jpg"],
      "offers":{"@type":"Offer","price":"2499.90","priceCurrency":"TRY"}}</script>`;
    expect(urunBilgisi(html, 'https://butik.test/urun/saten-midi-elbise')).toEqual({
      title: 'Saten Midi Elbise',
      imageUrl: 'https://cdn.butik.test/elbise.jpg',
      priceMinor: 249990,
      currency: 'TRY',
    });
  });

  test('@graph içindeki ürün ve dizi teklif', () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":["Product"],"name":"Çanta",
      "image":{"url":"https://b.test/c.jpg"},"offers":[{"price":1500,"priceCurrency":"try"}]}]}</script>`;
    expect(urunBilgisi(html, 'https://b.test/p/canta')).toEqual({
      title: 'Çanta',
      imageUrl: 'https://b.test/c.jpg',
      priceMinor: 150000,
      currency: 'TRY',
    });
  });

  test('JSON-LD yoksa og ve product: meta etiketleri', () => {
    const html = `<meta property="og:title" content="Keten G&ouml;mlek &amp; Pantolon">
      <meta property="og:image" content="http://b.test/g.jpg">
      <meta property="product:price:amount" content="1.150,00"><meta property="product:price:currency" content="TRY">`;
    expect(urunBilgisi(html, 'https://b.test/products/keten')).toEqual({
      title: 'Keten G&ouml;mlek & Pantolon',
      imageUrl: 'https://b.test/g.jpg',
      priceMinor: 115000,
      currency: 'TRY',
    });
  });

  test('JSON-LD fiyatında nokta hep ondalık ("1.500" = 1,50)', () => {
    const html = '<script type="application/ld+json">{"@type":"Product","name":"Toka","offers":{"price":"1.500","priceCurrency":"TRY"}}</script>';
    expect(urunBilgisi(html, 'https://b.test/p/toka')?.priceMinor).toBe(150);
  });

  test('bozuk JSON-LD atlanır; ad yoksa null', () => {
    expect(urunBilgisi('<script type="application/ld+json">{bozuk</script><p>x</p>', 'https://b.test/x')).toBeNull();
  });
});

describe('urunSayfasiOku', () => {
  test('ağ hatası ve 404 null döner', async () => {
    const hata = Object.assign(
      async () => {
        throw new Error('ECONNRESET');
      },
      { blockedUntil: () => 0 },
    );
    expect(await urunSayfasiOku('https://b.test/p/x', { fetch: hata })).toBeNull();
    const yok = Object.assign(async () => new Response('', { status: 404 }), { blockedUntil: () => 0 });
    expect(await urunSayfasiOku('https://b.test/p/x', { fetch: yok })).toBeNull();
  });
});
