// apps/api/src/lib/kayit/kayit-hazirla.test.ts
import { expect, test } from 'bun:test';
import { kayitHazirla } from './kayit-hazirla';

test('ürün sayfası: ad temizlenir, takip edilir', () => {
  expect(
    kayitHazirla({
      url: 'https://www.manuka.com.tr/pileli-kemerli-ekose-etek-camel',
      title: 'PİLELİ KEMERLİ EKOSE ETEK CAMEL | Manuka',
      butikAdi: 'Manuka',
    }),
  ).toEqual({ title: 'PİLELİ KEMERLİ EKOSE ETEK CAMEL', sayfaTuru: 'urun', takipEdilsin: true });
});

test('ana sayfa: başlığa dokunulmaz, takip edilmez', () => {
  expect(
    kayitHazirla({
      url: 'https://sinemkivanc.com/',
      title: 'Sinem Kıvanç | Kadın Giyim & Yeni Sezon Koleksiyonu',
      butikAdi: 'Sinem Kıvanç',
    }),
  ).toEqual({
    title: 'Sinem Kıvanç | Kadın Giyim & Yeni Sezon Koleksiyonu',
    sayfaTuru: 'urun_degil',
    takipEdilsin: false,
  });
});

test('bozuk adres çökmez', () => {
  expect(kayitHazirla({ url: 'x', title: 'Ad', butikAdi: 'B' })).toEqual({
    title: 'Ad',
    sayfaTuru: 'urun_degil',
    takipEdilsin: false,
  });
});
