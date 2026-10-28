import { expect, test } from 'bun:test';
import { restockAlertState } from './saved-tracking-status';

test('a stock alert is off, pending until the server sees the size sold out, then armed', () => {
  const now = new Date();
  expect(restockAlertState(null, null)).toBe('off');
  expect(restockAlertState(now, null)).toBe('pending');
  expect(restockAlertState(now, now)).toBe('armed');
});
