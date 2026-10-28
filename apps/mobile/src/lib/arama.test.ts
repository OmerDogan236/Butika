import { describe, expect, test } from 'bun:test';
import { butikcanAramasiMi, kelimeSayisi } from './arama';

describe('kelimeSayisi', () => {
  test('boş ve boşluk', () => {
    expect(kelimeSayisi('')).toBe(0);
    expect(kelimeSayisi('   ')).toBe(0);
  });
  test('çoklu boşluk tek ayraç', () => {
    expect(kelimeSayisi('  yazlık   keten  elbise ')).toBe(3);
    expect(kelimeSayisi('elbise')).toBe(1);
  });
});

describe('butikcanAramasiMi', () => {
  test('2 kelime hayır, 3 kelime evet', () => {
    expect(butikcanAramasiMi('keten elbise')).toBe(false);
    expect(butikcanAramasiMi('düğün için elbise')).toBe(true);
  });
});
