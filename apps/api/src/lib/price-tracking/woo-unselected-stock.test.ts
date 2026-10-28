import { afterEach, expect, test } from 'bun:test';
import { ARAGON_VARIATIONS, WOO_URL, wooPage, type WooVariation } from './woo-variations.fixture';
import { extractProductHtml } from './extract-product-price';
import { resolveProductPrice } from './price-source-router';

// A WooCommerce variable product tracked WITHOUT a chosen size. The page's
// JSON-LD states one product-level price and InStock, while the main product's
// own variations payload states that some sizes are sold out. Nothing here is
// about what production holds: the scenario is "a selection-less record is
// accepted", reproduced from a saved page with the network switched off.
const uniform = (inStock: boolean, price = 1999): WooVariation[] =>
  ARAGON_VARIATIONS.map(v => ({ ...v, inStock, price }));

test('the page states one product-level claim and a mixed per-size stock', () => {
  // The fixture's own relations, so the rest of the file rests on stated facts.
  const html = wooPage();
  expect(html).toContain('"availability":"https://schema.org/InStock"');
  expect(html).toContain(`action="${WOO_URL}"`);
  expect(ARAGON_VARIATIONS.filter(v => !v.inStock)).toHaveLength(3);
  expect(new Set(ARAGON_VARIATIONS.map(v => v.price)).size).toBe(1);
});

test('a selection-less address is read at product level, not per size', () => {
  // What the shared reader answers today for the tracked address.
  expect(extractProductHtml(wooPage(), WOO_URL)).toMatchObject({ status: 'success', priceMinor: 199900, currency: 'TRY' });
});

test('mixed per-size stock is not reported as verified stock', () => {
  expect(extractProductHtml(wooPage(), WOO_URL)).toHaveProperty('availability', 'unknown');
  // A page whose sizes agree keeps the state its own JSON-LD proves.
  expect(extractProductHtml(wooPage({ variations: uniform(true) }), WOO_URL)).toHaveProperty('availability', 'in_stock');
  expect(extractProductHtml(wooPage({ variations: uniform(false), productLevelAvailability: 'https://schema.org/OutOfStock' }), WOO_URL))
    .toHaveProperty('availability', 'out_of_stock');
});

test('variations that state different prices leave the product-level price unusable', () => {
  const mixed = ARAGON_VARIATIONS.map((v, i) => ({ ...v, inStock: true, price: i === 0 ? 999 : 1999 }));
  expect(extractProductHtml(wooPage({ variations: mixed }), WOO_URL))
    .toEqual({ status: 'not_found', contradiction: true, error: 'WooCommerce variations of this product state different prices' });
});

test.each([
  ['no variations payload at all', { payload: null }],
  ['an unreadable payload', { payload: '[{not json' }],
  ['a payload that is not an array', { payload: '{"variation_id":1}' }],
  ['a variation without a stock flag', { payload: '[{"variation_id":1,"display_price":1999}]' }],
  ['a variation without a readable price', { payload: '[{"variation_id":1,"display_price":"bir","is_in_stock":false}]' }],
  ['an empty variations list', { payload: '[]' }],
  ['a form that names another product', { formAction: 'https://www.pelinsenoglu.com/urun/baska-bir-urun/' }],
  ['a form with no action at all', { formAction: null }],
  ['two forms claiming this product', { forms: 2 }],
] as const)('evidence this reader cannot bind is no evidence: %s', (_name, options) => {
  // None of these may silently block a store: the page keeps the state its own
  // JSON-LD proves, exactly as before this guard existed.
  expect(extractProductHtml(wooPage(options), WOO_URL)).toHaveProperty('availability', 'in_stock');
});

test('a recommended product cannot lend its sold-out sizes to this product', () => {
  // The related section carries a whole variations_form of another product.
  const html = wooPage({ variations: uniform(true), recommendation: uniform(false) });
  expect(html).toContain('urun/baska-bir-urun/');
  expect(extractProductHtml(html, WOO_URL)).toHaveProperty('availability', 'in_stock');
});

test('a chosen size keeps its own path', () => {
  // The selected-variant route answers before this guard and is left untouched.
  const chosen = `${WOO_URL}?_butika_variant=woo%3A1785897%3A1785901`;
  expect(extractProductHtml(wooPage(), chosen)).toMatchObject({ status: 'not_found' });
});

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('the resolver reaches the same answer for the selection-less address', async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    requested.push(href);
    if (href === WOO_URL) return new Response(wooPage(), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    throw new Error(`Unexpected network request: ${href}`);
  }) as typeof fetch;

  const resolved = await resolveProductPrice({ url: WOO_URL });
  expect(resolved).toMatchObject({ status: 'success',
    observation: { priceMinor: 199900, currency: 'TRY', availability: 'unknown', provider: 'structured_html' } });
  expect(requested).toEqual([WOO_URL]);
});

test('sizes that agree with each other but not with the product-level claim', () => {
  // Every size sold out while the page's own JSON-LD still says InStock.
  expect(extractProductHtml(wooPage({ variations: uniform(false) }), WOO_URL)).toHaveProperty('availability', 'unknown');
  // The reverse contradiction: every size in stock while the claim says sold out.
  expect(extractProductHtml(wooPage({ variations: uniform(true), productLevelAvailability: 'https://schema.org/OutOfStock' }), WOO_URL))
    .toHaveProperty('availability', 'unknown');
  // One price across every size, and it is not the price the product states.
  expect(extractProductHtml(wooPage({ variations: uniform(true, 999) }), WOO_URL))
    .toEqual({ status: 'not_found', contradiction: true, error: 'WooCommerce variations of this product state a different price' });
});

test('an agreeing payload changes nothing', () => {
  expect(extractProductHtml(wooPage({ variations: uniform(true) }), WOO_URL))
    .toEqual({ status: 'success', priceMinor: 199900, currency: 'TRY', availability: 'in_stock', source: 'json-ld' });
  expect(extractProductHtml(wooPage({ variations: uniform(false), productLevelAvailability: 'https://schema.org/OutOfStock' }), WOO_URL))
    .toEqual({ status: 'success', priceMinor: 199900, currency: 'TRY', availability: 'out_of_stock', source: 'json-ld' });
});

test.each([
  ['a price of zero', '[{"variation_id":1,"display_price":0,"is_in_stock":true}]'],
  ['a negative price', '[{"variation_id":1,"display_price":-1999,"is_in_stock":true}]'],
  ['a price that is not finite', '[{"variation_id":1,"display_price":1e999,"is_in_stock":true}]'],
] as const)('an unusable amount is not price evidence: %s', (_name, payload) => {
  expect(extractProductHtml(wooPage({ payload }), WOO_URL)).toHaveProperty('availability', 'in_stock');
});

test('a contradicting page asks no stock endpoint and does not return to in stock', async () => {
  for (const variations of [ARAGON_VARIATIONS, uniform(false)]) {
    const requested: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const href = String(input instanceof Request ? input.url : input);
      requested.push(href);
      if (href === WOO_URL) return new Response(wooPage({ variations }), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      throw new Error(`Unexpected stock request: ${href}`);
    }) as typeof fetch;
    expect(await resolveProductPrice({ url: WOO_URL })).toMatchObject({ status: 'success',
      observation: { priceMinor: 199900, currency: 'TRY', availability: 'unknown' } });
    expect(requested).toEqual([WOO_URL]);
  }
});

// A contradiction is a refusal, not a gap: the router's next provider must not
// answer over it. The mock below serves a WooCommerce Store payload any provider
// would accept, so a pass here would be a real bypass and not a lucky failure.
const storePayload = (priceMinor: string) => JSON.stringify([{
  id: 1785897, name: 'Aragon', slug: 'aragon-asimetrik-kesim-bluz-pantolon-takim', permalink: WOO_URL,
  is_purchasable: true, type: 'variable',
  prices: { price: priceMinor, regular_price: priceMinor, sale_price: priceMinor, currency_code: 'TRY', currency_minor_unit: 2 },
}]);

function serve(html: string) {
  const requested: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    requested.push(href);
    if (href === WOO_URL) return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (href.includes('/wp-json/wc/store/') && href.includes('products?slug=aragon-asimetrik-kesim-bluz-pantolon-takim'))
      return new Response(storePayload('199900'), { headers: { 'content-type': 'application/json' } });
    throw new Error(`Unexpected network request: ${href}`);
  }) as typeof fetch;
  return requested;
}

test.each([
  ['sizes that disagree with each other', ARAGON_VARIATIONS.map((v, i) => ({ ...v, inStock: true, price: i === 0 ? 999 : 1999 }))],
  ['sizes that agree on another price', uniform(true, 999)],
] as const)('a price contradiction is not answered by the next provider: %s', async (_name, variations) => {
  serve(wooPage({ variations }));
  expect(await resolveProductPrice({ url: WOO_URL })).toMatchObject({ status: 'failed' });
});

test('an ordinary missing price still falls back to the next provider', async () => {
  // No contradiction, simply nothing this reader can use: the Store payload stands.
  serve('<html><body class="woocommerce"><p>Ürün açıklaması</p></body></html>');
  expect(await resolveProductPrice({ url: WOO_URL })).toMatchObject({ status: 'success',
    observation: { priceMinor: 199900, currency: 'TRY', provider: 'woocommerce' } });
});

test('a chosen size is still resolved on its own path', async () => {
  // The selected-Woo route asks the Store API for the parent and the variation;
  // the guard, the contradiction flag and the router stop are all out of its way.
  const chosen = `${WOO_URL}?_butika_variant=woo%3A1785897%3A1785901`;
  const requested: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    requested.push(href);
    if (href === WOO_URL) return new Response(wooPage(), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (href.endsWith('/wp-json/wc/store/v1/products/1785897'))
      return new Response(JSON.stringify({ id: 1785897, type: 'variable', permalink: WOO_URL,
        variations: [{ id: 1785901 }, { id: 1785904 }] }), { headers: { 'content-type': 'application/json' } });
    if (href.endsWith('/wp-json/wc/store/v1/products/1785901'))
      return new Response(JSON.stringify({ id: 1785901, parent: 1785897, type: 'variation', permalink: WOO_URL,
        is_in_stock: false, prices: { price: '199900', currency_code: 'TRY', currency_minor_unit: 2 } }),
        { headers: { 'content-type': 'application/json' } });
    throw new Error(`Unexpected network request: ${href}`);
  }) as typeof fetch;

  expect(await resolveProductPrice({ url: chosen })).toMatchObject({ status: 'success',
    observation: { priceMinor: 199900, currency: 'TRY', availability: 'out_of_stock', method: 'woo-variant' } });
});
