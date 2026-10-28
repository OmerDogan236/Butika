import { expect, test } from 'bun:test';
import { incelemeGirisiAcikMi } from './inceleme-girisi';

test('şalter kapalı → her yerden kapalı', () => {
  expect(incelemeGirisiAcikMi(false, 'US')).toBe(false);
  expect(incelemeGirisiAcikMi(false, null)).toBe(false);
});
test('şalter açık + Türkiye → kapalı (gerçek kullanıcı)', () =>
  expect(incelemeGirisiAcikMi(true, 'TR')).toBe(false));
test('şalter açık + yurt dışı → açık (Apple/Google inceleyicisi)', () => {
  expect(incelemeGirisiAcikMi(true, 'US')).toBe(true);
  expect(incelemeGirisiAcikMi(true, 'IE')).toBe(true);
});
test('şalter açık + ülke bilinmiyor (yerel) → açık', () =>
  expect(incelemeGirisiAcikMi(true, null)).toBe(true));
