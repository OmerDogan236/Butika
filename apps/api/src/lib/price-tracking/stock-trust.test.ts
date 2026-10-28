import { afterEach, expect, test } from 'bun:test';
import type { PriceResolutionResult } from './price-provider';
import { resolveProductPrice } from './price-source-router';
import { hasUnverifiedStock, withStockTrust } from './stock-trust';

const success = (availability?: 'in_stock' | 'out_of_stock' | 'unknown'): PriceResolutionResult => ({ status: 'success', attempts: [],
  observation: { priceMinor: 129999, currency: 'TRY', observedAt: new Date(0), provider: 'structured_html', method: 'json-ld', ...(availability ? { availability } : {}) } });

test.each(['https://big-lesson.com/products/jean', 'https://www.big-lesson.com/products/jean?Beden=38', 'https://m.BIG-LESSON.com/p'])(
  '%s keeps its price but not its page stock, in either direction', (url) => {
    for (const availability of ['in_stock', 'out_of_stock'] as const) {
      expect(withStockTrust(url, success(availability))).toMatchObject({ status: 'success',
        observation: { availability: 'unknown', priceMinor: 129999, currency: 'TRY', method: 'json-ld+stock-unverified-host' } });
    }
  });

test('other stores, unknown stock and failures are unchanged', () => {
  for (const url of ['https://www.kadriyebasturk.com/products/x', 'https://big-lesson.com.evil.test/products/x', 'https://notbig-lesson.com/products/x', 'not a url']) {
    expect(hasUnverifiedStock(url)).toBe(false);
    expect(withStockTrust(url, success('out_of_stock'))).toEqual(success('out_of_stock'));
  }
  expect(withStockTrust('https://big-lesson.com/products/x', success('unknown'))).toEqual(success('unknown'));
  expect(withStockTrust('https://big-lesson.com/products/x', success())).toEqual(success());
  const failed: PriceResolutionResult = { status: 'failed', reason: 'not_found', error: 'x', attempts: [] };
  expect(withStockTrust('https://big-lesson.com/products/x', failed)).toBe(failed);
});

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const page = (url: string, offers: unknown) =>
  `<link rel="canonical" href="${url}"><script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Jean', url, offers })}</script>`;
const serve = (html: string) => {
  globalThis.fetch = (async (input) => new URL(String(input)).pathname.endsWith('.js')
    ? new Response('', { status: 404 }) : new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })) as typeof fetch;
};

test('the resolver withholds Big Lesson stock for the product and for a selected size', async () => {
  const url = 'https://big-lesson.com/products/jean';
  const offer = (sku: string, availability: string, base = url) => ({ '@type': 'Offer', sku, url: `${base}?Beden=${sku}`, price: '1299.99',
    priceCurrency: 'TRY', availability: `https://schema.org/${availability}` });
  serve(page(url, offer('38', 'OutOfStock')));
  expect(await resolveProductPrice({ url })).toMatchObject({ status: 'success', observation: { availability: 'unknown', priceMinor: 129999 } });
  serve(page(url, [offer('38', 'InStock'), offer('40', 'OutOfStock')]));
  expect(await resolveProductPrice({ url: `${url}?_butika_variant=offer:38` }))
    .toMatchObject({ status: 'success', observation: { availability: 'unknown', priceMinor: 129999 } });
  // The same page on another /products/ store without Shopify endpoints keeps its verified stock.
  const other = 'https://shop.test/products/jean';
  serve(page(other, offer('38', 'OutOfStock', other)));
  expect(await resolveProductPrice({ url: other })).toMatchObject({ status: 'success', observation: { availability: 'out_of_stock' } });
});
