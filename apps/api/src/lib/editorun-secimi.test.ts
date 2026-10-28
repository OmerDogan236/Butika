import { describe, expect, test } from 'bun:test';
import { editorSirasinaGore, editorunSeciminiSirala } from './editorun-secimi';

const b = (
  id: string,
  editorSirasi: number | null,
  tarz1: string | null = null,
  fiyatSegmenti: string | null = null,
) => ({ id, name: id, editorSirasi, tarz1, tarz2: null, fiyatSegmenti, hedefYaslar: null });

const bos = { testPuanlari: null, favoriPuanlari: {}, fiyatSegmentleri: [] };

describe('editorSirasinaGore', () => {
  test('elle sıra küçükten büyüğe, boşlar sona', () => {
    const s = editorSirasinaGore([b('x', null), b('y', 2), b('z', 0), b('w', null)]);
    expect(s.map((r) => r.id)).toEqual(['z', 'y', 'w', 'x']);
  });
  test('aynı sırada ada göre (Türkçe harf sırası)', () => {
    const s = editorSirasinaGore([
      { name: 'Zeytin', editorSirasi: 1 },
      { name: 'Çiçek', editorSirasi: 1 },
      { name: 'Badem', editorSirasi: 1 },
    ]);
    expect(s.map((r) => r.name)).toEqual(['Badem', 'Çiçek', 'Zeytin']);
  });
  test('girdiyi değiştirmez', () => {
    const girdi = [b('b', 2), b('a', 1)];
    editorSirasinaGore(girdi);
    expect(girdi.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('editorunSeciminiSirala', () => {
  const liste = [b('d', null, 'minimal', 'orta'), b('a', 0, 'bohem', 'luks'), b('b', 1), b('c', 2)];

  test('girdi yoksa elle sıra', () => {
    expect(editorunSeciminiSirala(liste, null).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  test('profili olmayan kullanıcıda elle sıra', () => {
    expect(editorunSeciminiSirala(liste, bos).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  test('kişisel uyum öne geçer, eşitlikte elle sıra korunur', () => {
    const s = editorunSeciminiSirala(liste, {
      testPuanlari: { minimal: 5 },
      favoriPuanlari: {},
      fiyatSegmentleri: ['orta'],
    });
    expect(s.map((r) => r.id)).toEqual(['d', 'a', 'b', 'c']);
  });
  test('hiçbir butik kaybolmaz', () => {
    const s = editorunSeciminiSirala(liste, {
      testPuanlari: { bohem: 1 },
      favoriPuanlari: { minimal: 2 },
      fiyatSegmentleri: ['luks'],
    });
    expect([...s.map((r) => r.id)].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});
