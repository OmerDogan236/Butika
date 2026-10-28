import { expect, test } from 'bun:test';
import { isBlockedPage } from './extract-product-price';
test('normal product pages containing anti-bot script names are not challenge pages', () => {
  expect(isBlockedPage('<title>Dress</title><script src="https://cdn.test/challenge.js"></script><script>var provider="akamai";</script><h1>Dress</h1>')).toBe(false);
});
test('visible access challenges remain blocked', () => {
  expect(isBlockedPage('<title>Just a moment...</title><script>challenge()</script>')).toBe(true);
  expect(isBlockedPage('<h1>Access Denied</h1><p>Reference #123</p>')).toBe(true);
  expect(isBlockedPage('')).toBe(true);
});
