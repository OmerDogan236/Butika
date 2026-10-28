import { describe, expect, test } from 'bun:test';
import { beklemeSuresiMs } from './discovery-worker';

// Tekrar deneme siteleri rahatsiz etmemeli: her denemede bekleme uzar.
describe('beklemeSuresiMs', () => {
  test('ilk hatada 1 dakika', () => {
    expect(beklemeSuresiMs(1)).toBe(60_000);
  });

  test('ikinci hatada 4 dakika — ustel artis', () => {
    expect(beklemeSuresiMs(2)).toBe(4 * 60_000);
  });

  test('ucuncu hatada 9 dakika', () => {
    expect(beklemeSuresiMs(3)).toBe(9 * 60_000);
  });

  test('tavan 30 dakika — sonsuza kadar uzamaz', () => {
    expect(beklemeSuresiMs(50)).toBe(30 * 60_000);
  });

  test('bekleme her zaman pozitif', () => {
    for (let i = 1; i <= 10; i++) expect(beklemeSuresiMs(i)).toBeGreaterThan(0);
  });
});
