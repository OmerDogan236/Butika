import { afterEach, describe, expect, test } from 'bun:test';
import { selectShopifyPrice } from './shopify-price-selection';
import { shopifyPublicPriceProvider } from './shopify-public-provider';

const url = 'https://store.test/products/dress';
const product = { id: 1, handle: 'dress', price: 10000, variants: [{ id: 11, price: 10000 }, { id: 12, price: 10000 }] };
const originalFetch = globalThis.fetch;

test.each(['', '/tr', '/en-us'])('collection URLs preserve locale %s but omit collection from Ajax endpoints', async (locale) => {
  const requested: string[] = [];
  globalThis.fetch = (async (input) => {
    const target = String(input);
    requested.push(target);
    if (target === `https://store.test${locale}/cart.js`) return Response.json({ currency: 'TRY' });
    if (target === `https://store.test${locale}/products/dress.js`) return Response.json(product);
    return new Response('', { status: 404 });
  }) as typeof fetch;
  expect(await shopifyPublicPriceProvider.getPrice({ url: `https://store.test${locale}/collections/summer/products/dress?variant=12#details` }))
    .toMatchObject({ status: 'success', observation: { priceMinor: 10000, currency: 'TRY' } });
  expect(requested.sort()).toEqual([`https://store.test${locale}/cart.js`, `https://store.test${locale}/products/dress.js`].sort());
});
afterEach(() => { globalThis.fetch = originalFetch; });

test('equal prices across variants are unambiguous', () => {
  expect(selectShopifyPrice(product, url)).toEqual({ priceMinor: 10000, variantId: null });
});
test('an exact variant wins over the lower product minimum', () => {
  expect(selectShopifyPrice({ ...product, variants: [{ id: 11, price: 10000 }, { id: 12, price: 15000 }] }, `${url}?variant=12`))
    .toEqual({ priceMinor: 15000, variantId: '12' });
});
test.each([
  ['different prices', { ...product, variants: [{ id: 11, price: 10000 }, { id: 12, price: 15000 }] }, url],
  ['invalid variant price', { ...product, variants: [{ id: 11, price: 10000 }, { id: 12, price: 0 }] }, url],
  ['missing array with exact variant', { ...product, variants: undefined }, `${url}?variant=11`],
  ['missing array without variant', { ...product, variants: undefined }, url],
  ['empty variants', { ...product, variants: [] }, url],
  ['missing exact variant', product, `${url}?variant=99`],
  ['invalid variant', product, `${url}?variant=abc`],
  ['empty variant', product, `${url}?variant=`],
  ['duplicate parameter', product, `${url}?variant=11&variant=12`],
  ['duplicate variant id', { ...product, variants: [{ id: 11, price: 10000 }, { id: 11, price: 15000 }] }, `${url}?variant=11`],
  ['different product', { ...product, handle: 'other' }, url],
  ['price range metadata', { ...product, price_varies: true }, url],
  ['minimum mismatch', { ...product, price_min: 9000 }, url],
  ['maximum mismatch', { ...product, price_max: 11000 }, url],
  ['possibly truncated array', { ...product, variants: Array.from({ length: 250 }, (_, i) => ({ id: i + 1, price: 10000 })) }, url],
] as const)('rejects %s without permitting a generic fallback', (_label, data, target) => {
  expect(selectShopifyPrice(data, target)).toMatchObject({ status: 'failure', stopFallback: true });
});
test('uniform variants can supply a missing top-level price', () => {
  expect(selectShopifyPrice({ ...product, price: undefined }, url)).toEqual({ priceMinor: 10000, variantId: null });
});
test('unrelated JSON does not prohibit non-Shopify fallback', () => {
  expect(selectShopifyPrice({}, url)).not.toHaveProperty('stopFallback');
});
test('a currency endpoint failure cannot conceal confirmed variant ambiguity', async () => {
  globalThis.fetch = (async (input) => String(input).includes('/cart.js')
    ? new Response('', { status: 503 })
    : Response.json({ ...product, price_varies: true })) as typeof fetch;
  expect(await shopifyPublicPriceProvider.getPrice({ url })).toMatchObject({ status: 'failure', stopFallback: true });
});

describe('a renamed product', () => {
  const oldUrl = 'https://store.test/products/old-dress';
  const renamed = { id: 1, handle: 'new-dress', price: 10000, variants: [{ id: 11, price: 10000, available: false }, { id: 12, price: 10000, available: true }] };
  const store = (redirect: { status: number; location: string } | null, product: object = renamed) => {
    const requested: string[] = [];
    globalThis.fetch = (async (input, init) => {
      const target = String(input);
      requested.push(`${init?.redirect === 'manual' ? 'manual ' : ''}${target}`);
      if (target === 'https://store.test/cart.js') return Response.json({ currency: 'TRY' });
      if (target === 'https://store.test/products/old-dress' && redirect) return new Response(null, { status: redirect.status, headers: { location: redirect.location } });
      if (target === 'https://store.test/products/new-dress.js') return Response.json(product);
      return new Response('', { status: 404 });
    }) as typeof fetch;
    return requested;
  };

  test('keeps the saved size when the storefront redirects to its new handle', async () => {
    const requested = store({ status: 301, location: '/products/new-dress' });
    expect(await shopifyPublicPriceProvider.getPrice({ url: `${oldUrl}?variant=12` })).toMatchObject({ status: 'success',
      observation: { priceMinor: 10000, currency: 'TRY', availability: 'in_stock', method: 'product-js-variant+cart-js+renamed-handle' } });
    expect(requested).toContain('manual https://store.test/products/old-dress');
    expect(await shopifyPublicPriceProvider.getPrice({ url: `${oldUrl}?variant=11` })).toMatchObject({ status: 'success', observation: { availability: 'out_of_stock' } });
  });

  test('a redirect to a product without the saved variant keeps the original not_found', async () => {
    const requested = store({ status: 301, location: '/products/new-dress' }, { ...renamed, variants: [{ id: 99, price: 10000, available: true }] });
    const result = await shopifyPublicPriceProvider.getPrice({ url: `${oldUrl}?variant=12` });
    expect(requested).toContain('https://store.test/products/new-dress.js');
    expect(result).toMatchObject({ status: 'failure', reason: 'not_found' });
    expect(result).not.toHaveProperty('stopFallback');
  });

  test('a product-level URL does not guess a product from a redirect', async () => {
    const requested = store({ status: 301, location: '/products/new-dress' });
    expect(await shopifyPublicPriceProvider.getPrice({ url: oldUrl })).toMatchObject({ status: 'failure', reason: 'not_found' });
    expect(requested.some(r => r.startsWith('manual'))).toBe(false);
  });

  test.each([
    ['another origin', { status: 301, location: 'https://other.test/products/new-dress' }],
    ['a collection', { status: 301, location: '/collections/dresses' }],
    ['the home page', { status: 302, location: '/' }],
    ['the same handle', { status: 301, location: '/products/old-dress' }],
  ])('a redirect to %s is not followed', async (_name, redirect) => {
    const requested = store(redirect);
    expect(await shopifyPublicPriceProvider.getPrice({ url: `${oldUrl}?variant=12` })).toMatchObject({ status: 'failure', reason: 'not_found' });
    expect(requested).not.toContain('https://store.test/products/new-dress.js');
  });

  test('a deleted product stays not_found', async () => {
    store(null);
    expect(await shopifyPublicPriceProvider.getPrice({ url: `${oldUrl}?variant=12` })).toMatchObject({ status: 'failure', reason: 'not_found' });
  });
});

describe('storefront endpoint evidence', () => {
  type Endpoint = number | 'timeout' | 'network' | { json: unknown };
  const answer = (endpoint: Endpoint) => {
    if (endpoint === 'timeout') { const error = new Error('aborted'); error.name = 'AbortError'; throw error; }
    if (endpoint === 'network') throw new TypeError('connection reset');
    return typeof endpoint === 'object' ? Response.json(endpoint.json) : new Response('', { status: endpoint });
  };
  test.each<[string, Endpoint, Endpoint, boolean]>([
    ['both endpoints answer 404', 404, 404, true],
    ['the cart endpoint answers', 404, { json: { currency: 'TRY' } }, false],
    ['the product endpoint has a server error', 503, 404, false],
    ['the product endpoint is blocked', 429, 404, false],
    ['the product endpoint times out', 'timeout', 404, false],
    ['the cart endpoint has a network error', 404, 'network', false],
  ])('storefrontMissing only when %s', async (_name, productJs, cartJs, missing) => {
    globalThis.fetch = (async (input) => {
      const target = String(input);
      if (target === 'https://store.test/products/dress.js') return answer(productJs);
      if (target === 'https://store.test/cart.js') return answer(cartJs);
      return new Response('', { status: 404 });
    }) as typeof fetch;
    const result = await shopifyPublicPriceProvider.getPrice({ url });
    expect(result.status).toBe('failure');
    expect(result.status === 'failure' && result.storefrontMissing === true).toBe(missing);
  });
});
