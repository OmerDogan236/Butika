import { expect, test } from 'bun:test';
import { GosterimOlcer } from './gosterim-olcumu';

function kur(liste = 'vitrin') {
  const kayitlar: Record<string, unknown>[] = [];
  const olcer = new GosterimOlcer(liste, (y) => kayitlar.push(y));
  return { olcer, kayitlar };
}

test('görülen kart bir kez sayılır, sırası ve ortak bilgiyle', () => {
  const { olcer, kayitlar } = kur();
  olcer.baglam('giyim:onerilen', { category_id: 'giyim', siralama: 'onerilen' });
  olcer.gorundu([
    { id: 'a', sira: 1 },
    { id: 'b', sira: 2 },
  ]);
  olcer.gorundu([
    { id: 'b', sira: 2 },
    { id: 'c', sira: 3 },
  ]);
  expect(kayitlar).toEqual([
    {
      boutique_id: 'a',
      list: 'vitrin',
      list_position: 1,
      category_id: 'giyim',
      siralama: 'onerilen',
    },
    {
      boutique_id: 'b',
      list: 'vitrin',
      list_position: 2,
      category_id: 'giyim',
      siralama: 'onerilen',
    },
    {
      boutique_id: 'c',
      list: 'vitrin',
      list_position: 3,
      category_id: 'giyim',
      siralama: 'onerilen',
    },
  ]);
});

test('bağlam değişince (kategori, sıralama) aynı butik yeniden sayılır', () => {
  const { olcer, kayitlar } = kur();
  olcer.baglam('giyim:onerilen', {});
  olcer.gorundu([{ id: 'a', sira: 1 }]);
  olcer.baglam('giyim:yeni', {});
  olcer.gorundu([{ id: 'a', sira: 4 }]);
  expect(kayitlar.map((k) => k.list_position)).toEqual([1, 4]);
});

test('ortak bilgi yokken görülenler bekler, gelince gönderilir', () => {
  const { olcer, kayitlar } = kur('arama');
  olcer.baglam('canli:elbise', null);
  olcer.gorundu([{ id: 'a', sira: 1 }]);
  expect(kayitlar).toHaveLength(0);
  olcer.baglam('canli:elbise', { search_id: 's1' });
  expect(kayitlar).toEqual([
    { boutique_id: 'a', list: 'arama', list_position: 1, search_id: 's1' },
  ]);
});

test('arama sayılmadan metin değişirse bekleyen gösterimler düşer', () => {
  const { olcer, kayitlar } = kur('arama');
  olcer.baglam('canli:elb', null);
  olcer.gorundu([{ id: 'a', sira: 1 }]);
  olcer.baglam('canli:elbise', { search_id: 's1' });
  expect(kayitlar).toHaveLength(0);
});

test('bağlam kurulmadan gelen görünürlük sayılmaz', () => {
  const { olcer, kayitlar } = kur();
  olcer.gorundu([{ id: 'a', sira: 1 }]);
  expect(kayitlar).toHaveLength(0);
});
