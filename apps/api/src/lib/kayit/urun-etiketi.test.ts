// apps/api/src/lib/kayit/urun-etiketi.test.ts
import { expect, test } from 'bun:test';
import { GUNLUK_SINIR, etiketCozumle, kalanHak } from './urun-etiketi';

test('geçerli cevap çözülür', () => {
  expect(etiketCozumle('{"tur":"elbise","renk":"ekru_krem","malzeme":"keten"}')).toEqual({
    tur: 'elbise',
    renk: 'ekru_krem',
    malzeme: 'keten',
  });
  expect(etiketCozumle('{"tur":"canta","renk":null,"malzeme":null}')).toEqual({
    tur: 'canta',
    renk: null,
    malzeme: null,
  });
});

test('sözlük dışı, eksik, fazladan alanlı ya da JSON olmayan cevap null döner', () => {
  expect(etiketCozumle('{"tur":"uzay_gemisi","renk":null,"malzeme":null}')).toBeNull();
  expect(etiketCozumle('{"tur":"elbise","renk":"fosforlu","malzeme":null}')).toBeNull();
  expect(etiketCozumle('{"tur":"elbise"}')).toBeNull();
  expect(etiketCozumle('{"tur":"elbise","renk":null,"malzeme":null,"not":"x"}')).toBeNull();
  expect(etiketCozumle('elbise')).toBeNull();
  expect(etiketCozumle('')).toBeNull();
  expect(etiketCozumle('[]')).toBeNull();
});

test('günlük hak 500 ve sıfırın altına inmez', () => {
  expect(GUNLUK_SINIR).toBe(500);
  expect(kalanHak(0)).toBe(500);
  expect(kalanHak(499)).toBe(1);
  expect(kalanHak(500)).toBe(0);
  expect(kalanHak(9999)).toBe(0);
});
