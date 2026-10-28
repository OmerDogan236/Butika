// apps/api/src/lib/kayit/sayfa-turu.test.ts
import { expect, test } from 'bun:test';
import { sayfaTuru } from './sayfa-turu';

test('ana sayfa ürün değildir (dil öneki olsa da)', () => {
  expect(sayfaTuru('https://www.manuka.com.tr/')).toBe('urun_degil');
  expect(sayfaTuru('https://gizia.com')).toBe('urun_degil');
  expect(sayfaTuru('https://fleuofficial.com/tr')).toBe('urun_degil');
  expect(sayfaTuru('https://site.com/tr-tr/')).toBe('urun_degil');
});

test('liste, giriş ve görsel adresleri ürün değildir', () => {
  expect(sayfaTuru('https://capsuleofus.com/collections/kai-1')).toBe('urun_degil');
  expect(sayfaTuru('https://www.butikmerveaksoy.com/yeni-gelenler')).toBe('urun_degil');
  expect(sayfaTuru('https://www.mothuvintage.com/yeni-gelenler?sayfa=3')).toBe('urun_degil');
  expect(sayfaTuru('https://sentetiksezar.com/trenckot?o=3&page=2')).toBe('urun_degil');
  expect(sayfaTuru('https://www.penti.com/tr/login')).toBe('urun_degil');
  expect(
    sayfaTuru('https://www.hofsilk.com/cdn/shop/files/26_05_HouseOfSilk_Lb.jpg?v=1&width=5000'),
  ).toBe('urun_degil');
});

test('ürün adresleri ürün kalır', () => {
  expect(
    sayfaTuru('https://fleuofficial.com/tr/collections/all-bags/products/le-passage-36-cashmere?variant=52675762487589'),
  ).toBe('urun');
  expect(sayfaTuru('https://rossea.co/products/valerie-bag-grey-leather?variant=45006923923743')).toBe('urun');
  expect(sayfaTuru('https://www.dilvin.com.tr/91685-baskili-straplez-elbise-mavi')).toBe('urun');
  expect(sayfaTuru('https://gebematernity.com/tr/product/hamile-elbisesi-lalin/')).toBe('urun');
  expect(sayfaTuru('https://www.zenpirlanta.com/urun/isik-seli-pirlanta-bileklik-3001141505')).toBe('urun');
  expect(sayfaTuru('https://www.muun.com.tr/lapis-palace')).toBe('urun');
  expect(sayfaTuru('https://ninetythirdco.com/shelle?size=one-size&_butika_variant=ikas%3Aabc')).toBe('urun');
});

test('liste kelimesiyle başlayan ürün adı ürün kalır', () => {
  expect(sayfaTuru('https://site.com/yeni-gelenler-elbise-123')).toBe('urun');
  expect(sayfaTuru('https://site.com/collections-edition-bag')).toBe('urun');
});

test('bozuk adres ürün değildir', () => {
  expect(sayfaTuru('nedir bu')).toBe('urun_degil');
  expect(sayfaTuru('')).toBe('urun_degil');
});

test('liste kökünün derinindeki ya da indirim yolundaki ürün, ürün kalır', () => {
  expect(sayfaTuru('https://site.com/kategori/elbise/kirmizi-elbise-123')).toBe('urun');
  expect(sayfaTuru('https://site.com/sale/red-dress-1')).toBe('urun');
  expect(sayfaTuru('https://site.com/indirim/kirmizi-elbise')).toBe('urun');
  expect(sayfaTuru('https://site.com/kirmizi-elbise-123?p=4')).toBe('urun');
  expect(sayfaTuru('https://site.com/kirmizi-elbise?page=1')).toBe('urun');
  expect(sayfaTuru('https://site.com/xs')).toBe('urun');
});

test('kurumsal sayfalar ve çıplak ürün listesi ürün değildir', () => {
  expect(sayfaTuru('https://site.com/hakkimizda')).toBe('urun_degil');
  expect(sayfaTuru('https://site.com/iletisim')).toBe('urun_degil');
  expect(sayfaTuru('https://site.com/products')).toBe('urun_degil');
  expect(sayfaTuru('https://site.com/urun')).toBe('urun_degil');
  expect(sayfaTuru('https://site.com/kategori/elbise')).toBe('urun_degil');
});
