import { afterEach, expect, test } from 'bun:test';
import { resolveProductPrice } from './price-source-router';

// A /products/ address on a store that is not a Shopify Online Store: the page is
// served, but Shopify's product and cart endpoints are absent. The missing
// endpoints only allow the page's own verified stock to stand.
const url = 'https://shop.test/products/dress';
const offer = (sku: string, availability?: string) => ({ '@type': 'Offer', sku, price: '449.90', priceCurrency: 'TRY',
  url: `${url}?Beden=${sku}`, ...(availability ? { availability: `https://schema.org/${availability}` } : {}) });
const page = (offers: unknown) => `<html><head><link rel="canonical" href="${url}">` +
  `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Dress', url, offers })}</script></head><body></body></html>`;
type Endpoint = number | 'timeout' | 'network' | { json: unknown };
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function store(html: string, productJs: Endpoint = 404, cartJs: Endpoint = 404) {
  const answer = (endpoint: Endpoint) => {
    if (endpoint === 'timeout') { const error = new Error('aborted'); error.name = 'AbortError'; throw error; }
    if (endpoint === 'network') throw new TypeError('connection reset');
    if (typeof endpoint === 'object') return Response.json(endpoint.json);
    return new Response('', { status: endpoint });
  };
  globalThis.fetch = (async (input) => {
    const target = new URL(String(input));
    if (target.pathname === '/products/dress.js') return answer(productJs);
    if (target.pathname === '/cart.js') return answer(cartJs);
    if (target.pathname === '/products/dress') return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    return new Response('', { status: 404 });
  }) as typeof fetch;
}
const stock = async (address = url) => {
  const result = await resolveProductPrice({ url: address });
  return result.status === 'success' ? result.observation.availability : `failed:${result.reason}`;
};

test.each([['OutOfStock', 'out_of_stock'], ['InStock', 'in_stock']])('a single verified %s offer stands when both Shopify endpoints are absent', async (value, expected) => {
  store(page([offer('STD', value)]));
  expect(await stock()).toBe(expected);
});

test('absent endpoints are not stock evidence: mixed or unstated offers stay unknown', async () => {
  store(page([offer('S', 'InStock'), offer('M', 'OutOfStock')]));
  expect(await stock()).toBe('unknown');
  store(page([offer('STD')]));
  expect(await stock()).toBe('unknown');
});

test('a wrong or unverifiable saved size never inherits the page stock', async () => {
  store(page([offer('STD', 'OutOfStock')]));
  expect(await stock(`${url}?variant=999`)).not.toMatch(/^(in_stock|out_of_stock)$/);
});

test('a removed saved size is not read from the remaining offers', async () => {
  store(page([offer('S', 'InStock'), offer('M', 'OutOfStock')]));
  expect(await stock(`${url}?_butika_variant=offer:L`)).toBe('failed:not_found');
  expect(await stock(`${url}?_butika_variant=offer:M`)).toBe('out_of_stock'); // the size still offered keeps its own stock
});

test.each<[string, Endpoint, Endpoint]>([
  ['product endpoint server error', 503, 404],
  ['product endpoint blocked', 429, 404],
  ['product endpoint timeout', 'timeout', 404],
  ['product endpoint network error', 'network', 404],
  ['cart endpoint server error', 404, 503],
  ['cart endpoint timeout', 404, 'timeout'],
  ['cart endpoint answering (a real Shopify store)', 404, { json: { currency: 'TRY' } }],
])('%s proves nothing about stock', async (_name, productJs, cartJs) => {
  store(page([offer('STD', 'OutOfStock')]), productJs, cartJs);
  expect(await stock()).toBe('unknown');
});
