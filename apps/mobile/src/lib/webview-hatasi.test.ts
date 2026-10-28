import { expect, test } from 'bun:test';
import { hataAlanAdi, ilkKezMi, sayilacakYuklemeHatasi } from './webview-hatasi';

test('alan adı: yol ve parametreler atılır, www kalkar', () => {
  expect(hataAlanAdi('https://www.Ornek.com/sepet?token=abc')).toBe('ornek.com');
  expect(hataAlanAdi('https://magaza.ornek.com.tr/urun/1')).toBe('magaza.ornek.com.tr');
  expect(hataAlanAdi('bozuk adres')).toBeNull();
  expect(hataAlanAdi(undefined)).toBeNull();
});

test('yarıda kesilen yükleme hata sayılmaz', () => {
  expect(sayilacakYuklemeHatasi(-999)).toBe(false);
  expect(sayilacakYuklemeHatasi(102)).toBe(false);
  expect(sayilacakYuklemeHatasi(-1009)).toBe(true);
  expect(sayilacakYuklemeHatasi(undefined)).toBe(true);
});

test('aynı hata bir kez', () => {
  const g = new Set<string>();
  expect(ilkKezMi(g, 'http:500:ornek.com')).toBe(true);
  expect(ilkKezMi(g, 'http:500:ornek.com')).toBe(false);
  expect(ilkKezMi(g, 'http:404:ornek.com')).toBe(true);
});
