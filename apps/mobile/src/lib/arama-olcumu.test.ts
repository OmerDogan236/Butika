import { expect, test } from 'bun:test';
import { AramaOlcer, type AramaOlcumKaydi, BEKLEME_MS, aramaYuku } from './arama-olcumu';

function kur() {
  const kayitlar: AramaOlcumKaydi[] = [];
  let bekleyen: { fn: () => void; ms: number } | null = null;
  let n = 0;
  const olcer = new AramaOlcer(
    (k) => kayitlar.push(k),
    () => `s${++n}`,
    (fn, ms) => {
      bekleyen = { fn, ms };
      return () => {
        bekleyen = null;
      };
    },
  );
  const sureDoldu = () => {
    const b = bekleyen;
    bekleyen = null;
    b?.fn();
  };
  return { olcer, kayitlar, sureDoldu, bekliyor: () => bekleyen?.ms ?? null };
}

test('yazarken gelen ara sonuçlar sayılmaz; yazma bitince tek kayıt', () => {
  const { olcer, kayitlar, sureDoldu, bekliyor } = kur();
  olcer.sonuclarGeldi('el', 30);
  olcer.sonuclarGeldi('elb', 12);
  olcer.sonuclarGeldi('elbise', 8);
  expect(kayitlar).toHaveLength(0);
  expect(bekliyor()).toBe(BEKLEME_MS);
  sureDoldu();
  expect(kayitlar).toEqual([{ searchId: 's1', query: 'elbise', resultsCount: 8, mode: 'canli' }]);
});

test('aynı metin üst üste iki kez sayılmaz, farklı metin yeni kayıt', () => {
  const { olcer, kayitlar, sureDoldu } = kur();
  olcer.sonuclarGeldi('elbise', 8);
  sureDoldu();
  olcer.sonuclarGeldi('Elbise ', 8);
  sureDoldu();
  expect(kayitlar).toHaveLength(1);
  olcer.sonuclarGeldi('çanta', 0);
  sureDoldu();
  expect(kayitlar.map((k) => k.query)).toEqual(['elbise', 'çanta']);
});

test('Ara tuşu ya da sonuca dokunma beklemeden kaydeder ve kimliği döndürür', () => {
  const { olcer, kayitlar, sureDoldu } = kur();
  olcer.sonuclarGeldi('keten', 5);
  const k = olcer.gonder();
  expect(k?.searchId).toBe('s1');
  sureDoldu();
  expect(kayitlar).toHaveLength(1);
  // Kayıttan sonra dokunma: aynı arama kimliği
  expect(olcer.gonder()?.searchId).toBe('s1');
  expect(kayitlar).toHaveLength(1);
});

test('metin silinirse bekleyen arama düşer', () => {
  const { olcer, kayitlar, sureDoldu } = kur();
  olcer.sonuclarGeldi('kot', 3);
  olcer.vazgec();
  sureDoldu();
  expect(kayitlar).toHaveLength(0);
});

test('metin değişince dokunuş eski aramaya bağlanmaz', () => {
  const { olcer, sureDoldu } = kur();
  olcer.sonuclarGeldi('elbise', 8);
  sureDoldu();
  olcer.vazgec();
  expect(olcer.gonder()).toBeNull();
});

test('metin değişip aynısı yeniden yazılınca yeni arama sayılır', () => {
  const { olcer, kayitlar, sureDoldu } = kur();
  olcer.sonuclarGeldi('elbise', 8);
  sureDoldu();
  olcer.vazgec();
  olcer.sonuclarGeldi('elbise', 8);
  expect(olcer.gonder()?.searchId).toBe('s2');
  expect(kayitlar).toHaveLength(2);
});

test('dinleyici ekrandaki aramanın kaydını alır, metin değişince null', () => {
  const { olcer, sureDoldu } = kur();
  const gorulen: (string | null)[] = [];
  const birak = olcer.dinle((k) => gorulen.push(k?.searchId ?? null));
  olcer.sonuclarGeldi('elbise', 8);
  sureDoldu();
  olcer.gonder();
  olcer.vazgec();
  birak();
  olcer.sonuclarGeldi('kot', 2);
  sureDoldu();
  expect(gorulen).toEqual(['s1', null]);
});

test('aynı metin Butikcan sıralamasında ayrı arama sayılır', () => {
  const { olcer, kayitlar, sureDoldu } = kur();
  olcer.sonuclarGeldi('yazlık keten elbise', 4);
  sureDoldu();
  olcer.sonuclarGeldi('yazlık keten elbise', 6, 'butikcan');
  olcer.gonder();
  expect(kayitlar.map((k) => k.mode)).toEqual(['canli', 'butikcan']);
});

test('olay yükü: sonuç sayısı ve sıfır sonuç', () => {
  expect(
    aramaYuku({ searchId: 's1', query: 'x', resultsCount: 0, mode: 'canli' }, 'boutique'),
  ).toEqual({
    query: 'x',
    target: 'boutique',
    search_id: 's1',
    search_mode: 'canli',
    results_count: 0,
    is_zero_result: true,
  });
});
