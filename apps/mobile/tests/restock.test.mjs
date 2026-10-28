import { expect, test } from 'bun:test';
import { restockControl, restockErrorKey } from '../src/lib/restock.ts';

const tracking = (status) => ({ status, priceMinor: null, currency: null, checkedAt: null });

test('the stock alert is offered only for a verified sell-out, and an existing alert is always shown', () => {
  expect(restockControl(tracking('out_of_stock'), 'off')).toBe('notify');
  expect(restockControl(tracking('active'), 'off')).toBeNull();
  expect(restockControl(tracking('unverified'), undefined)).toBeNull();
  expect(restockControl(undefined, undefined)).toBeNull();
  expect(restockControl(tracking('pending'), 'pending')).toBe('pending');
  expect(restockControl(tracking('active'), 'armed')).toBe('armed');
});

test('server refusals have their own message', () => {
  expect(restockErrorKey('already_in_stock')).toBe('saved.restock_already_in_stock');
  expect(restockErrorKey('stock_unknown')).toBe('saved.restock_stock_unknown');
  expect(restockErrorKey('restock_unavailable')).toBe('saved.restock_restock_unavailable');
  expect(restockErrorKey('internal')).toBe('saved.restockFailed');
  expect(restockErrorKey(undefined)).toBe('saved.restockFailed');
});
