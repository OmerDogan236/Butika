import { describe, expect, test } from 'bun:test';
import { anaSayfaMi } from './urun-sayfasi';

describe('anaSayfaMi', () => {
  test('butiğin kök sayfasını yakalar', () => {
    // 21-22 Eylül 2026'da canlıda ana sayfa olarak kaydedilen gerçek adresler.
    expect(anaSayfaMi('https://www.dilvin.com.tr/')).toBe(true);
    expect(anaSayfaMi('https://www.manuka.com.tr/')).toBe(true);
    expect(anaSayfaMi('https://kenzel.com.tr/')).toBe(true);
    expect(anaSayfaMi('https://tamias.co/')).toBe(true);
    expect(anaSayfaMi('https://gizemparcali.com/')).toBe(true);
  });

  test('sondaki eğik çizgi olmadan da yakalar', () => {
    expect(anaSayfaMi('https://tamias.co')).toBe(true);
  });

  test('sorgu ve çapa ana sayfa olmasını değiştirmez', () => {
    expect(anaSayfaMi('https://tamias.co/?utm_source=butika')).toBe(true);
    expect(anaSayfaMi('https://tamias.co/#hero')).toBe(true);
  });

  test('dil önekli kök sayfaları da yakalar', () => {
    expect(anaSayfaMi('https://example.com/tr')).toBe(true);
    expect(anaSayfaMi('https://example.com/en-tr/')).toBe(true);
  });

  test('ürün sayfalarına karışmaz', () => {
    expect(anaSayfaMi('https://www.manuka.com.tr/dugmeli-kruvaze-trenckot-vizon')).toBe(false);
    expect(anaSayfaMi('https://www.sandandblue.com/collections/newnew/products/tia')).toBe(false);
  });

  test('kategori ve ara sayfalara karışmaz', () => {
    expect(anaSayfaMi('https://example.com/collections/all')).toBe(false);
    expect(anaSayfaMi('https://example.com/kadin')).toBe(false);
    // Üç harfli tek parça dil öneki değildir, kategori olabilir.
    expect(anaSayfaMi('https://example.com/new')).toBe(false);
  });

  test('bozuk adreste akışı bozmaz', () => {
    expect(anaSayfaMi('')).toBe(false);
    expect(anaSayfaMi('butik.com')).toBe(false);
  });
});
