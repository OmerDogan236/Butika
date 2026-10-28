import { describe, expect, test } from 'bun:test';
import { fiyataGoreSirala, alfabetikSirala, gecerliSiralama } from './boutique-sort';

// Test verisi: veritabanından geldiği hâliyle — temsiliFiyatTl Drizzle'da
// numeric olduğu için METİN olarak gelir ('2450.00'), sayı olarak değil.
const butik = (ad: string, segment: string | null, fiyat: string | null) => ({
  ad,
  fiyatSegmenti: segment,
  temsiliFiyatTl: fiyat,
});

const adlar = (satirlar: { ad: string }[]) => satirlar.map((s) => s.ad);

describe('fiyataGoreSirala', () => {
  test("'onerilen' sırayı hiç değiştirmez", () => {
    const girdi = [
      butik('C', 'luks', '20000.00'),
      butik('A', 'uygun', '500.00'),
      butik('B', null, null),
    ];
    expect(adlar(fiyataGoreSirala(girdi, 'onerilen'))).toEqual(['C', 'A', 'B']);
  });

  test("'uygun_once' segmentleri ucuzdan pahalıya dizer", () => {
    const girdi = [
      butik('luks', 'luks', '20000.00'),
      butik('orta', 'orta', '3000.00'),
      butik('uygun', 'uygun', '500.00'),
      butik('yuksek', 'yuksek', '7000.00'),
    ];
    expect(adlar(fiyataGoreSirala(girdi, 'uygun_once'))).toEqual([
      'uygun',
      'orta',
      'yuksek',
      'luks',
    ]);
  });

  test("'luks_once' sırayı tersine çevirir", () => {
    const girdi = [
      butik('uygun', 'uygun', '500.00'),
      butik('luks', 'luks', '20000.00'),
      butik('orta', 'orta', '3000.00'),
    ];
    expect(adlar(fiyataGoreSirala(girdi, 'luks_once'))).toEqual(['luks', 'orta', 'uygun']);
  });

  test('aynı segmentteki butikler temsili fiyata göre sıralanır', () => {
    const girdi = [
      butik('pahali', 'orta', '4500.00'),
      butik('ucuz', 'orta', '900.00'),
      butik('orta', 'orta', '3000.00'),
      butik('ortanin-alti', 'orta', '1200.00'),
    ];
    // '900' metin olarak '1200'den SONRA gelir ama sayı olarak ÖNCE gelir —
    // bu test tam da o farkı yakalasın diye böyle kuruldu. Fiyatların hane
    // sayısı eşit olursa metin sıralaması da doğru sonucu verir ve test
    // Number() dönüşümü silinse bile yeşil kalır.
    expect(adlar(fiyataGoreSirala(girdi, 'uygun_once'))).toEqual([
      'ucuz',
      'ortanin-alti',
      'orta',
      'pahali',
    ]);
  });

  test('segmentsiz butikler HER ZAMAN sonda kalır ve kendi sıralarını korur', () => {
    const girdi = [
      butik('segmentsiz1', null, null),
      butik('luks', 'luks', '20000.00'),
      butik('segmentsiz2', null, null),
      butik('uygun', 'uygun', '500.00'),
    ];
    // uygun_once: segmentliler önce, segmentsizler girdideki sırayla sonda
    expect(adlar(fiyataGoreSirala(girdi, 'uygun_once'))).toEqual([
      'uygun',
      'luks',
      'segmentsiz1',
      'segmentsiz2',
    ]);
    // luks_once: segmentsizler yine ÖNE ÇIKMAZ
    expect(adlar(fiyataGoreSirala(girdi, 'luks_once'))).toEqual([
      'luks',
      'uygun',
      'segmentsiz1',
      'segmentsiz2',
    ]);
  });

  test('tanınmayan segment değeri segmentsiz sayılır', () => {
    const girdi = [butik('bozuk', 'saçmalık', '900.00'), butik('uygun', 'uygun', '500.00')];
    expect(adlar(fiyataGoreSirala(girdi, 'uygun_once'))).toEqual(['uygun', 'bozuk']);
  });

  test('segmenti olup fiyatı olmayan butik kendi segmentinin sonuna düşer', () => {
    const girdi = [
      butik('fiyatsiz', 'orta', null),
      butik('fiyatli', 'orta', '3000.00'),
      butik('ucuz', 'uygun', '400.00'),
    ];
    expect(adlar(fiyataGoreSirala(girdi, 'uygun_once'))).toEqual(['ucuz', 'fiyatli', 'fiyatsiz']);
  });

  test('girdi dizisini değiştirmez', () => {
    const girdi = [butik('B', 'luks', '20000.00'), butik('A', 'uygun', '500.00')];
    fiyataGoreSirala(girdi, 'uygun_once');
    expect(adlar(girdi)).toEqual(['B', 'A']);
  });

  test('boş dizi patlamaz', () => {
    expect(fiyataGoreSirala([], 'uygun_once')).toEqual([]);
  });
});

describe('alfabetikSirala', () => {
  test('A–Z Türkçe alfabe', () => {
    const s = alfabetikSirala(['Ürün', 'Özge', 'Zeynep', 'Çağla', 'Şule', 'İpek', 'Irmak', 'Ceren', 'ahu'].map((name) => ({ name })));
    expect(s.map((x) => x.name)).toEqual(['ahu', 'Ceren', 'Çağla', 'Irmak', 'İpek', 'Özge', 'Şule', 'Ürün', 'Zeynep']);
  });
});

describe('gecerliSiralama', () => {
  test('tanınmayan ve eksik sort onerilen olur', () => {
    expect(gecerliSiralama(undefined)).toBe('onerilen');
    expect(gecerliSiralama('xyz')).toBe('onerilen');
    expect(gecerliSiralama('kisisel')).toBe('kisisel');
    expect(gecerliSiralama('alfabetik')).toBe('alfabetik');
  });
});
