// apps/api/src/lib/kayit/urun-etiketi-job.test.ts
import { expect, test } from 'bun:test';
import { adresIpucu, partiPlani } from './urun-etiketi-job';

const etiket = { tur: 'elbise', renk: null, malzeme: null } as const;

test('aynı adres daha önce etiketlendiyse Gemini çağrılmaz, kopyalanır', () => {
  const plan = partiPlani(
    [{ id: '1', url: 'https://a/x', title: 'Elbise · Beden: S' }],
    new Map([['https://a/x', etiket]]),
    10,
  );
  expect(plan).toEqual([{ id: '1', islem: 'kopyala', etiket }]);
});

test('hak kadar ürün sorulur, kalanı bekler; varyant eki modele gitmez', () => {
  const plan = partiPlani(
    [
      { id: '1', url: 'https://a/1', title: 'Keten Elbise · Renk: Ekru / Beden: M' },
      { id: '2', url: 'https://a/2', title: 'Deri Çanta' },
    ],
    new Map(),
    1,
  );
  expect(plan).toEqual([{ id: '1', islem: 'sor', ad: 'Keten Elbise' }]);
  // adres '/1': harf yok, ipucu eklenmez
});

test('hak sıfırsa yalnız kopyalananlar yapılır', () => {
  const plan = partiPlani(
    [
      { id: '1', url: 'https://a/1', title: 'A' },
      { id: '2', url: 'https://a/2', title: 'B' },
    ],
    new Map([['https://a/2', etiket]]),
    0,
  );
  expect(plan).toEqual([{ id: '2', islem: 'kopyala', etiket }]);
});

test('adres ipucu: son parça okunur metne çevrilir, anlamsızsa boş', () => {
  expect(adresIpucu('https://lafaba.com/kadin-straplez-yaka-uzun-abiye-elbise-26k920602?renk=siyah')).toBe(
    ' (adres: kadin straplez yaka uzun abiye elbise 26k920602)',
  );
  expect(adresIpucu('https://a/p/12345')).toBe('');
  expect(adresIpucu('bozuk')).toBe('');
  expect(
    partiPlani([{ id: '1', url: 'https://a/keten-elbise-ekru', title: 'Kadın Giyim | A' }], new Map(), 1),
  ).toEqual([{ id: '1', islem: 'sor', ad: 'Kadın Giyim | A (adres: keten elbise ekru)' }]);
});
