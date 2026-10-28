import { afterEach, expect, test } from 'bun:test';
import { extractProductHtml, extractProductPrice } from './extract-product-price';
import { ARROW_VARIATIONS, GEBE_ARROW_URL as URL_, GEBE_CARLOTTA, GEBE_CARLOTTA_URL, gebePage as page, type GebePage as Page } from './gebematernity.fixture';
import { resolveProductPrice } from './price-source-router';
import { readWooVariationClaim } from './woo-variation-stock';

// The first test reads the two pages' real variation states and prices; every other
// state, id, address and form below is made up from them.
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const read = (o: Page = {}) => extractProductHtml(page(o), o.url ?? URL_);
const price = { status: 'success', priceMinor: 21385, currency: 'TRY', source: 'unit-price-specification' } as const;
// The product-level claim, exactly what the page gave before the action-less form was bound.
const claim = { ...price, availability: 'in_stock' } as const;
const unknown = { ...price, availability: 'unknown' } as const;
const every = (inStock: boolean, amount = 213.85) => ARROW_VARIATIONS.map(v => ({ ...v, inStock, price: amount }));

test('the two pages as fetched: the action-less form is bound by its product ids', () => {
  // cardigan-arrow: two of twelve variations in stock under an InStock claim.
  expect(readWooVariationClaim(page(), URL_)).toEqual({ priceMajor: 213.85, inStock: 'mixed' });
  expect(read()).toEqual(unknown);
  // dress-carlotta: five of five sold out under an OutOfStock claim; the claim stands.
  expect(readWooVariationClaim(page(GEBE_CARLOTTA), GEBE_CARLOTTA_URL)).toEqual({ priceMajor: 844.35, inStock: false });
  expect(read(GEBE_CARLOTTA)).toEqual({ ...price, priceMinor: 84435, availability: 'out_of_stock' });
});

test('sizes that agree with the claim keep it, a single variation too', () => {
  expect(read({ variations: every(true) })).toEqual(claim);
  expect(read({ variations: every(false), availability: 'OutOfStock' })).toEqual({ ...price, availability: 'out_of_stock' });
  expect(read({ variations: ARROW_VARIATIONS.filter(v => v.id === 2799) })).toEqual(claim);
});

test('a claim the sizes contradict is withheld', () => {
  expect(read({ variations: every(true), availability: 'OutOfStock' })).toEqual(unknown);
  expect(read({ variations: every(false) })).toEqual(unknown);
});

test('sizes that state another price leave no price', () => {
  const differing = ARROW_VARIATIONS.map((v, i) => ({ ...v, price: i ? 213.85 : 199.95 }));
  expect(read({ variations: differing })).toEqual({ status: 'not_found', contradiction: true, error: 'WooCommerce variations of this product state different prices' });
  expect(read({ variations: every(true, 199.95) })).toEqual({ status: 'not_found', contradiction: true, error: 'WooCommerce variations of this product state a different price' });
});

test.each([
  ['no data-product_id on the form', { formProductId: null }],
  ['another product on the form', { formProductId: '1601' }],
  ['no postid on the body', { postIds: [] }],
  ['another postid', { postIds: ['1601'] }],
  ['two postids', { postIds: ['2019', '1601'] }],
  ['the form outside any #product-N', { blockId: null }],
  ['the form inside another product block', { blockId: '1601' }],
  ['no add-to-cart field', { addToCart: null }],
  ['another add-to-cart', { addToCart: '1601' }],
  ['no product_id field', { hiddenProductId: null }],
  ['another product_id', { hiddenProductId: '1601' }],
  ['no shortlink', { shortlink: null }],
  ['a shortlink to another post', { shortlink: 'https://gebematernity.com/?p=1601' }],
  ['a shortlink on another host', { shortlink: 'https://www.example.com/?p=2019' }],
  ['no REST link', { rest: null }],
  ['a REST link to another product', { rest: 'https://gebematernity.com/wp-json/wp/v2/product/1601' }],
  ['no canonical', { canonical: null }],
  ['a second action-less form', { forms: 2 }],
  ['another product\'s action-less form elsewhere', { tail: '<form class="variations_form cart" data-product_id="1601" data-product_variations="[]"></form>' }],
  ['an explicit action naming another page', { action: 'https://gebematernity.com/product/cardigan-valeri/' }],
  ['an empty action', { action: '' }],
] as const)('an action-less form that is not proven to be this product\'s is not bound: %s', (_name, options) => {
  expect(readWooVariationClaim(page(options), URL_)).toBeNull();
  expect(read(options)).toEqual(claim);
});

test('another canonical: not bound, and the reader refuses the page itself', () => {
  const canonical = 'https://gebematernity.com/product/cardigan-valeri/';
  expect(readWooVariationClaim(page({ canonical }), URL_)).toBeNull();
  // The price source's own identity check, unchanged by the binding.
  expect(read({ canonical })).toEqual({ status: 'not_found', error: 'Schema offer cannot be used: product_identity_unproven' });
});

test('the existing contract is unchanged: a same-page action binds, an empty one does not, on any store', () => {
  // The parser hands action="" back as null (like a missing attribute), so the
  // existing contract never bound it; the action-less path needs the attribute absent.
  expect(read({ action: URL_ })).toEqual(unknown);
  const other = 'https://www.example-woo.com/product/cardigan-arrow/';
  expect(extractProductHtml(page({ url: other, action: other }), other)).toEqual(unknown);
  expect(extractProductHtml(page({ url: other, action: '' }), other)).toEqual(claim);
  expect(extractProductHtml(page({ url: other }), other)).toEqual(claim);
});

test('the action-less form is bound on gebematernity.com only', () => {
  const path = new URL(URL_).pathname;
  for (const url of [`https://www.example-woo.com${path}`, `http://gebematernity.com${path}`, `https://gebematernity.com:8443${path}`,
    `https://gebematernity.com.example.com${path}`]) {
    expect(readWooVariationClaim(page({ url }), url)).toBeNull();
    expect(extractProductHtml(page({ url }), url)).toEqual(claim);
  }
  const www = `https://www.gebematernity.com${path}`;
  expect(extractProductHtml(page({ url: www }), www)).toEqual(unknown);
});

test('neither enrichment nor another provider fills in the withheld stock', async () => {
  // Made up: the store API would say in stock at the same price. The bound sizes
  // withheld the stock, so it is never asked, and the resolver stops at the page.
  const requested: string[] = [];
  const store = [{ slug: 'cardigan-arrow', prices: { price: '21385', currency_code: 'TRY', currency_minor_unit: 2 }, type: 'simple',
    is_in_stock: true, is_purchasable: true, is_on_backorder: false, stock_availability: { class: 'in-stock' } }];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    requested.push(href);
    if (href === URL_) return new Response(page(), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (href.startsWith('https://gebematernity.com/wp-json/wc/store/')) return Response.json(store);
    throw new Error(`Unexpected request: ${href}`);
  }) as typeof fetch;
  expect(await extractProductPrice(URL_)).toEqual(unknown);
  expect(requested).toEqual([URL_]);
  requested.length = 0;
  const resolved = await resolveProductPrice({ url: URL_ });
  expect(resolved).toMatchObject({ status: 'success', observation: { priceMinor: 21385, currency: 'TRY', availability: 'unknown', provider: 'structured_html' } });
  expect(resolved.attempts.map(a => `${a.provider}:${a.status}`)).toEqual(['structured_html:success']);
  expect(requested).toEqual([URL_]);
});
