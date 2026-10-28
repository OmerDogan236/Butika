import { expect, test } from 'bun:test';
import { butikAcmaYuku, butikYolu, siraOku } from './butik-kaynagi';

test('yol: kaynak, sıralama ve liste sırası parametre olarak taşınır', () => {
  expect(butikYolu('b1', 'vitrin', 'kisisel')).toEqual({
    pathname: '/boutique/[id]',
    params: { id: 'b1', kaynak: 'vitrin', siralama: 'kisisel' },
  });
  expect(butikYolu('b1', 'firsat')).toEqual({
    pathname: '/boutique/[id]',
    params: { id: 'b1', kaynak: 'firsat' },
  });
  expect(butikYolu('b1', 'vitrin', undefined, 3)).toEqual({
    pathname: '/boutique/[id]',
    params: { id: 'b1', kaynak: 'vitrin', sira: '3' },
  });
});

test('olay yükü: eski alanlar korunur, yeni alanlar eklenir', () => {
  expect(butikAcmaYuku('b1', 'vitrin', 'kisisel', '4')).toEqual({
    boutiqueId: 'b1',
    boutique_id: 'b1',
    kaynak: 'vitrin',
    entry_source: 'vitrin',
    siralama: 'kisisel',
    list_position: 4,
  });
});

test('olay yükü: bilinmeyen kaynak, sıralama ve sıra gönderilmez', () => {
  expect(butikAcmaYuku('b1', undefined, undefined)).toEqual({
    boutiqueId: 'b1',
    boutique_id: 'b1',
  });
  expect(butikAcmaYuku('b1', 'uydurma', 'x'.repeat(50), 'abc')).toEqual({
    boutiqueId: 'b1',
    boutique_id: 'b1',
  });
});

test('olay yükü: vitrindeki her sıralama değeri geçer', () => {
  for (const s of ['onerilen', 'uygun_once', 'luks_once', 'kisisel', 'alfabetik']) {
    expect(butikAcmaYuku('b1', 'vitrin', s)).toMatchObject({ kaynak: 'vitrin', siralama: s });
  }
});

test('sıra: yalnız pozitif tam sayı', () => {
  expect(siraOku('1')).toBe(1);
  expect(siraOku('0')).toBeNull();
  expect(siraOku('-2')).toBeNull();
  expect(siraOku('1.5')).toBeNull();
  expect(siraOku(undefined)).toBeNull();
});
