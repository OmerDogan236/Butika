import { describe, expect, test } from 'bun:test';
import { SORU_MAX, kirp } from './butikcan-soru';

describe('kirp', () => {
  test('baştaki ve sondaki boşlukları atar', () => {
    expect(kirp('  abiye elbise \n')).toBe('abiye elbise');
  });

  test('araya sıkışmış boşlukları teke indirir', () => {
    expect(kirp('düğüne   ne\n\ngiysem')).toBe('düğüne ne giysem');
  });

  test('uzun metni SORU_MAX karakterde keser', () => {
    const uzun = 'a'.repeat(SORU_MAX + 50);
    expect(kirp(uzun)).toHaveLength(SORU_MAX);
  });

  test('sınırdaki metne dokunmaz', () => {
    const tam = 'b'.repeat(SORU_MAX);
    expect(kirp(tam)).toBe(tam);
  });

  test('boş metin için null döner', () => {
    expect(kirp('   ')).toBeNull();
    expect(kirp('')).toBeNull();
  });
});
