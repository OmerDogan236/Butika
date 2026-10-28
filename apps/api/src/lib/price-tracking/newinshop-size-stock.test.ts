import { afterEach, expect, test } from 'bun:test';
import { extractProductHtml } from './extract-product-price';
import { newinshopChoice } from './newinshop-size-stock';
import { resolveProductPrice } from './price-source-router';
import { NEWINSHOP_ID as ID, NEWINSHOP_URL as URL_, newinshopCarousel as carousel, newinshopPage as page, type NewinshopPage as Page } from './newinshop.fixture';

const read = (o: Page = {}) => extractProductHtml(page(o), o.url ?? URL_);
const price = { status: 'success', priceMinor: 555000, currency: 'TRY', source: 'json-ld' } as const;
const unknown = { ...price, availability: 'unknown' } as const;

test('the fixture keeps the real page shape: one form, three sizes, no price step', () => {
  expect(newinshopChoice(page(), URL_)).toEqual({ kind: 'choice', fields: 1, values: 3 });
  expect(newinshopChoice(page({ sizes: null }), URL_)).toEqual({ kind: 'no_choice' });
});

test('a product that asks for a size keeps its price and states no stock', () => {
  expect(read()).toEqual(unknown);
  // The product-level claim is no size's state either way round.
  expect(read({ availability: 'OutOfStock' })).toEqual(unknown);
  expect(read({ availability: null })).toEqual(unknown);
});

test('one size left is no evidence of that size\'s stock', () => {
  expect(read({ sizes: ['S/36'] })).toEqual(unknown);
  expect(read({ sizes: ['S/36'], availability: 'OutOfStock' })).toEqual(unknown);
});

test('a product without a choice keeps its product-level schema stock', () => {
  // Standard-size products (beyaz-dikisli-volanli-siyah-mini-etek, mor-desenli-bluz).
  expect(read({ sizes: null })).toEqual({ ...price, availability: 'in_stock' });
  expect(read({ sizes: null, availability: 'OutOfStock' })).toEqual({ ...price, availability: 'out_of_stock' });
});

test('a select that is not the product\'s own form is not its choice', () => {
  const select = '<select name="option[901]"><option value="">Beden</option><option value="1" data="0">M</option></select>';
  // A recommendation card inside .product-info, a modal, the review area, a template and a comment.
  expect(read({ sizes: null, card: carousel(select) })).toEqual({ ...price, availability: 'in_stock' });
  for (const tail of [`<div id="bedenler" class="uk-modal"><div class="uk-modal-dialog">${select}</div></div>`,
    `<div id="review">${select}</div>`, `<template>${select}</template>`, `<!-- ${select} -->`]) {
    expect(read({ sizes: null, tail })).toEqual({ ...price, availability: 'in_stock' });
  }
  // A choice field anywhere else on the page cannot be tied to anything: no stock.
  expect(read({ sizes: null, tail: `<div class="free">${select}</div>` })).toEqual(unknown);
});

test('a form that cannot be tied to this product gives no stock', () => {
  const standard = { sizes: null } as const;
  expect(read({ ...standard, forms: 2 })).toEqual(unknown);
  expect(read({ ...standard, formIds: [ID, '1000000100'] })).toEqual(unknown);
  expect(read({ ...standard, formIds: ['1000000100'] })).toEqual(unknown);
  expect(read({ ...standard, formIds: [] })).toEqual(unknown);
  // The id only inside a recommendation card is not the product form's id.
  expect(read({ ...standard, formIds: [], card: carousel(`<input type="hidden" name="product_id" value="${ID}" />`) })).toEqual(unknown);
  expect(read({ ...standard, metaId: '1000000100' })).toEqual(unknown);
  expect(read({ ...standard, schemaId: '1000000100' })).toEqual(unknown);
  // With neither the JSON-LD id nor the meta id there is nothing to tie the form to.
  expect(read({ ...standard, schemaId: null, metaId: null })).toEqual(unknown);
  // Either one is enough when it names the form's id.
  expect(read({ ...standard, metaId: null })).toEqual({ ...price, availability: 'in_stock' });
  expect(read({ ...standard, schemaId: null })).toEqual({ ...price, availability: 'in_stock' });
});

test('no chosen size is read: the store has no verified size identity', () => {
  for (const selection of ['newinshop:3017', 'offer:3017', '3017']) {
    expect(read({ url: `${URL_}?_butika_variant=${encodeURIComponent(selection)}` })).toMatchObject({ status: 'not_found' });
  }
  // A plain variant parameter keeps the existing rule: price, no stock.
  expect(read({ url: `${URL_}?variant=3017` })).toEqual(unknown);
});

test('a generic offer selection is not taken for a verified newinshop size', () => {
  // Made-up JSON-LD with one offer per size, which the generic offer:<sku> contract
  // reads. newinshop has no size identity we verified, so the answer does not count.
  const offers = ['3017', '3018'].map(sku => ({ '@type': 'Offer', sku, url: URL_, price: '5550.00', priceCurrency: 'TRY', availability: 'https://schema.org/InStock' }));
  const perSize = page().replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Yelek', productID: ID, offers })}</script>`);
  expect(extractProductHtml(perSize, `${URL_}?_butika_variant=offer:3017`)).toEqual({ status: 'not_found', error: 'A newinshop size cannot be verified' });
  // Control: on another store the same page is read by that contract.
  const elsewhere = 'https://www.example.com/baliksirti-desenli-yelek';
  expect(extractProductHtml(perSize.replaceAll(URL_, elsewhere), `${elsewhere}?_butika_variant=offer:3017`))
    .toMatchObject({ status: 'success', priceMinor: 555000, availability: 'in_stock' });
});

test('a size that changes the price leaves no product price', () => {
  // The six pages of 2026-09-25 all write data="0"; a step would make the product
  // price no size's price.
  const differs = { status: 'not_found', contradiction: true, error: 'newinshop sizes change the product price' } as const;
  expect(read({ differences: ['0', '50', '0'] })).toEqual(differs);
  expect(read({ differences: ['0', '0', '-100,00 TL'] })).toEqual(differs);
  expect(read({ differences: ['0', null, '0'] })).toEqual(differs);
  expect(read({ differences: ['0,00 TL', '0.00', '0'] })).toEqual(unknown);
});

test.each([
  ['another store', 'https://www.example.com/baliksirti-desenli-yelek'],
  ['plain http', 'http://www.newinshop.co/baliksirti-desenli-yelek'],
  ['a port', 'https://www.newinshop.co:8443/baliksirti-desenli-yelek'],
  ['a subdomain', 'https://shop.newinshop.co/baliksirti-desenli-yelek'],
])('the rule is newinshop.co\'s own: %s keeps product-level stock', (_name, url) => {
  // The slashed date is also newinshop's own, so these pages carry an ISO date.
  expect(read({ url, validUntil: '2040-04-10' })).toEqual({ ...price, availability: 'in_stock' });
  expect(newinshopChoice(page({ url }), url)).toEqual({ kind: 'other_host' });
});

test('the store without www is the same store', () => {
  const url = 'https://newinshop.co/baliksirti-desenli-yelek';
  expect(read({ url })).toEqual(unknown);
});

// The full resolver, with the network replaced: the page answers for its own
// address and a WooCommerce Store API that would say "in stock" at the same price
// answers for the rest. The page is marked woocommerce so that the stock enrichment
// would ask it (newinshop is not WooCommerce; this is test data).
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
function serve(html: string) {
  const asked: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input instanceof Request ? input.url : input);
    asked.push(url);
    if (url === URL_) return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url.includes('/wp-json/wc/store/')) {
      return Response.json([{ id: 1, slug: 'baliksirti-desenli-yelek', type: 'simple', permalink: URL_, is_purchasable: true, is_in_stock: true,
        is_on_backorder: false, stock_availability: { class: 'in-stock' },
        prices: { price: '555000', regular_price: '555000', sale_price: '555000', currency_code: 'TRY', currency_minor_unit: 2 } }]);
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return asked;
}

test('the resolver keeps the size stock unknown and asks no other source for it', async () => {
  const asked = serve(page({ bodyClass: 'woocommerce' }));
  const result = await resolveProductPrice({ url: URL_ });
  expect(result).toMatchObject({ status: 'success', observation: { priceMinor: 555000, currency: 'TRY', availability: 'unknown', provider: 'structured_html' } });
  expect(asked).toEqual([URL_]);
});

test('control: without a size the same enrichment does supply the stock', async () => {
  // Same page, no size select and no schema availability: the product-level
  // enrichment runs and the Store API answer is taken, as for any other store.
  const asked = serve(page({ bodyClass: 'woocommerce', sizes: null, availability: null }));
  const result = await resolveProductPrice({ url: URL_ });
  expect(result).toMatchObject({ status: 'success', observation: { priceMinor: 555000, availability: 'in_stock', provider: 'structured_html' } });
  expect(asked.some(url => url.includes('/wp-json/wc/store/'))).toBe(true);
});

test('the resolver reads the product-level stock of a product without a choice', async () => {
  serve(page({ sizes: null, availability: 'OutOfStock' }));
  expect(await resolveProductPrice({ url: URL_ })).toMatchObject({ status: 'success', observation: { priceMinor: 555000, availability: 'out_of_stock' } });
});
