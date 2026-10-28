import { describe, expect, test } from 'bun:test';
import { firsatSirasinaGore } from './firsatlar';

const b = (name: string, firsatSirasi: number | null) => ({ name, firsatSirasi });

describe('firsatSirasinaGore', () => {
  test('elle sıra küçükten büyüğe, boşlar sona', () => {
    const s = firsatSirasinaGore([b('x', null), b('y', 2), b('z', 0), b('w', null)]);
    expect(s.map((r) => r.name)).toEqual(['z', 'y', 'w', 'x']);
  });
  test('aynı sırada ada göre (Türkçe harf sırası)', () => {
    const s = firsatSirasinaGore([b('Zeytin', 1), b('Çiçek', 1), b('Badem', 1)]);
    expect(s.map((r) => r.name)).toEqual(['Badem', 'Çiçek', 'Zeytin']);
  });
  test('sırasızlar da ada göre', () => {
    const s = firsatSirasinaGore([b('Şeftali', null), b('Ayva', null), b('Çilek', null)]);
    expect(s.map((r) => r.name)).toEqual(['Ayva', 'Çilek', 'Şeftali']);
  });
  test('girdiyi değiştirmez', () => {
    const girdi = [b('b', 2), b('a', 1)];
    firsatSirasinaGore(girdi);
    expect(girdi.map((r) => r.name)).toEqual(['b', 'a']);
  });
});
