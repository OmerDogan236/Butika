import { expect, test } from 'bun:test';
import { nextFailureCheck, nextSuccessCheck } from './check-schedule';
test('temporary failures back off, removed products wait a day, retailer deadlines win', () => {
  expect(nextFailureCheck(0, 0, 'timeout').getTime()).toBe(15 * 60_000);
  expect(nextFailureCheck(0, 1, 'timeout').getTime()).toBe(30 * 60_000);
  expect(nextFailureCheck(0, 30, 'timeout').getTime()).toBe(6 * 60 * 60_000);
  expect(nextFailureCheck(0, 0, 'not_found').getTime()).toBe(24 * 60 * 60_000);
  expect(nextFailureCheck(0, 0, 'blocked', 7 * 24 * 60 * 60_000).getTime()).toBe(7 * 24 * 60 * 60_000);
});
test('a sold-out size with a restock alert is checked every 6 hours, everything else daily', () => {
  expect(nextSuccessCheck(0, 'out_of_stock', true).getTime()).toBe(6 * 60 * 60_000);
  expect(nextSuccessCheck(0, 'unknown', true).getTime()).toBe(6 * 60 * 60_000);
  expect(nextSuccessCheck(0, 'in_stock', true).getTime()).toBe(24 * 60 * 60_000);
  expect(nextSuccessCheck(0, 'out_of_stock', false).getTime()).toBe(24 * 60 * 60_000);
});
