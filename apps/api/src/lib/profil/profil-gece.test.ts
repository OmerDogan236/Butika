import { describe, expect, test } from 'bun:test';
import { geceZamaniMi, istanbulGunu } from './profil-gece';

// İstanbul UTC+3 (yaz saati yok).
describe('gece işi zamanı', () => {
  test('istanbulGunu İstanbul takvim gününü verir', () => {
    expect(istanbulGunu(new Date('2026-10-21T21:30:00Z'))).toBe('2026-10-22');
    expect(istanbulGunu(new Date('2026-10-21T20:59:00Z'))).toBe('2026-10-21');
  });

  test('03:00 öncesi çalışmaz', () => {
    expect(geceZamaniMi(new Date('2026-10-21T23:59:00Z'), null)).toBe(false); // 02:59
  });

  test('03:00 sonrası, bugün çalışmadıysa çalışır', () => {
    expect(geceZamaniMi(new Date('2026-10-22T00:00:00Z'), null)).toBe(true); // 03:00
    expect(geceZamaniMi(new Date('2026-10-22T00:30:00Z'), '2026-10-21')).toBe(true);
  });

  test('aynı gün ikinci kez çalışmaz', () => {
    expect(geceZamaniMi(new Date('2026-10-22T05:00:00Z'), '2026-10-22')).toBe(false);
  });

  test('gece kaçırıldıysa (sunucu kapalıydı) gün içinde yetişir', () => {
    expect(geceZamaniMi(new Date('2026-10-22T12:00:00Z'), '2026-10-21')).toBe(true);
  });
});
