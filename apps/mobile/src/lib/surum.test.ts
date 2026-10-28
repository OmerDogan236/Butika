import { describe, expect, test } from 'bun:test';
import { surumDahaYeniMi } from './surum';

describe('surumDahaYeniMi', () => {
  test('yama, ara ve ana sürüm büyükse yeni', () => {
    expect(surumDahaYeniMi('1.2.0', '1.2.1')).toBe(true);
    expect(surumDahaYeniMi('1.2.9', '1.3.0')).toBe(true);
    expect(surumDahaYeniMi('1.9.9', '2.0.0')).toBe(true);
  });
  test('sayısal karşılaştırır, metin gibi değil', () => {
    expect(surumDahaYeniMi('1.2.0', '1.10.0')).toBe(true);
    expect(surumDahaYeniMi('1.10.0', '1.9.0')).toBe(false);
  });
  test('eşit ya da eski sürüm yeni değil', () => {
    expect(surumDahaYeniMi('1.2.0', '1.2.0')).toBe(false);
    expect(surumDahaYeniMi('1.2.0', '1.1.9')).toBe(false);
    expect(surumDahaYeniMi('2.0.0', '1.9.9')).toBe(false);
  });
  test('boş ya da bozuk değerde false', () => {
    expect(surumDahaYeniMi('1.2.0', null)).toBe(false);
    expect(surumDahaYeniMi(null, '1.3.0')).toBe(false);
    expect(surumDahaYeniMi(undefined, undefined)).toBe(false);
    expect(surumDahaYeniMi('1.2.0', '')).toBe(false);
    expect(surumDahaYeniMi('1.2.0', '1.3')).toBe(false);
    expect(surumDahaYeniMi('1.2.0', 'v1.3.0')).toBe(false);
    expect(surumDahaYeniMi('1.2.0', '1.3.0-beta')).toBe(false);
    expect(surumDahaYeniMi('abc', '1.3.0')).toBe(false);
  });
  test('kenar boşluklarını yok sayar', () => {
    expect(surumDahaYeniMi(' 1.2.0 ', '1.3.0 ')).toBe(true);
  });
});
