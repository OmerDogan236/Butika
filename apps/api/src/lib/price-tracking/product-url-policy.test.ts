import { expect, test } from 'bun:test';
import { isTrackableProductUrl } from './product-url-policy';

test('products on the boutique site, its subdomains or parent domain are trackable', () => {
  expect(isTrackableProductUrl('https://www.brand.com.tr/elbise-123', 'https://brand.com.tr')).toBe(true);
  expect(isTrackableProductUrl('https://brand.com.tr/p?variant=1', 'https://www.brand.com.tr/')).toBe(true);
  expect(isTrackableProductUrl('https://shop.brand.com/products/a', 'https://brand.com')).toBe(true);
  expect(isTrackableProductUrl('https://brand.com/products/a', 'https://tr.brand.com')).toBe(true);
  expect(isTrackableProductUrl('http://brand.com/products/a', 'brand.com')).toBe(true);
});

test('other sites and unsafe URLs are saved without server-side tracking', () => {
  expect(isTrackableProductUrl('https://other.com/products/a', 'https://brand.com')).toBe(false);
  expect(isTrackableProductUrl('https://notbrand.com/products/a', 'https://brand.com')).toBe(false);
  expect(isTrackableProductUrl('https://brand.com.evil.net/a', 'https://brand.com')).toBe(false);
  expect(isTrackableProductUrl('http://169.254.169.254/latest', 'https://brand.com')).toBe(false);
  expect(isTrackableProductUrl('https://user:pw@brand.com/a', 'https://brand.com')).toBe(false);
  expect(isTrackableProductUrl('https://brand.com:8080/a', 'https://brand.com')).toBe(false);
  expect(isTrackableProductUrl('javascript:alert(1)', 'https://brand.com')).toBe(false);
  expect(isTrackableProductUrl('https://brand.com/a', '')).toBe(false);
});
