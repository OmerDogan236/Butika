// apps/api/src/lib/kayit/temizlik-plani.test.ts
import { expect, test } from 'bun:test';
import { temizlikPlani } from './temizlik-plani';

const satir = (o: Partial<Parameters<typeof temizlikPlani>[0][number]>) => ({
  id: 'a',
  url: 'https://www.manuka.com.tr/etek-1',
  title: 'ETEK | Manuka',
  butikAdi: 'Manuka',
  sayfaTuru: null,
  trackedProductId: 't1',
  ...o,
});

test('adı değişen ürün plana girer, takip sürer', () => {
  expect(temizlikPlani([satir({})])).toEqual([
    { id: 'a', eskiAd: 'ETEK | Manuka', yeniAd: 'ETEK', sayfaTuru: 'urun', takibiBirak: false },
  ]);
});

test('ana sayfa kaydı: ad aynı kalır, takip bırakılır', () => {
  expect(temizlikPlani([satir({ url: 'https://www.manuka.com.tr/', title: 'Kadın Giyim | Manuka' })])).toEqual([
    { id: 'a', eskiAd: 'Kadın Giyim | Manuka', yeniAd: 'Kadın Giyim | Manuka', sayfaTuru: 'urun_degil', takibiBirak: true },
  ]);
});

test('zaten temiz ve sınıflandırılmış satır plana girmez', () => {
  expect(temizlikPlani([satir({ title: 'ETEK', sayfaTuru: 'urun' })])).toEqual([]);
});

test('takibi olmayan ürün-değil satırda takibiBirak false', () => {
  const [adim] = temizlikPlani([satir({ url: 'https://www.manuka.com.tr/', trackedProductId: null })]);
  expect(adim?.takibiBirak).toBe(false);
});
