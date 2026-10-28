import { describe, expect, test } from 'bun:test';
import { siraBirlestir, tarzProfiliniSec } from './butikcan-ortak';

describe('siraBirlestir', () => {
  test('geçerli seçimler öne, kalanlar ön eleme sırasıyla, tekrarsız', () => {
    const sirali = ['a', 'b', 'c', 'd'];
    expect(siraBirlestir(['c', 'a'], new Set(sirali), sirali)).toEqual(['c', 'a', 'b', 'd']);
  });
  test('aday olmayan seçimler atılır', () => {
    expect(siraBirlestir(['x', 'b'], new Set(['a', 'b']), ['a', 'b'])).toEqual(['b', 'a']);
  });
  test('seçim yoksa yalnız sıralı liste', () => {
    expect(siraBirlestir([], new Set(['a']), ['a'])).toEqual(['a']);
  });
  test('en fazla 30', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `id${i}`);
    const out = siraBirlestir(['id40'], new Set(ids), ids);
    expect(out).toHaveLength(30);
    expect(out[0]).toBe('id40');
    expect(new Set(out).size).toBe(30);
  });
});

describe('tarzProfiliniSec (Butikcan: profil mi test mi)', () => {
  const test_ = { tarz1: 'bohem', tarz2: null, fiyatSegmentleri: ['uygun'] };
  const profil = {
    tarz1: 'minimal',
    tarz2: 'sokak',
    fiyatSegmentleri: ['orta'],
    aramaIpuclari: ['keten'],
  };
  test('AI rızası yoksa hiçbir şey kullanılmaz', () => {
    expect(tarzProfiliniSec(false, test_, profil)).toBeUndefined();
    expect(tarzProfiliniSec(false, test_, null)).toBeUndefined();
  });
  test('rıza + profil varsa profil önce', () => {
    expect(tarzProfiliniSec(true, test_, profil)).toEqual(profil);
  });
  test('profil yoksa bugünkü gibi test', () => {
    expect(tarzProfiliniSec(true, test_, null)).toEqual(test_);
    expect(tarzProfiliniSec(true, null, null)).toBeUndefined();
  });
});
