import { afterEach, expect, test } from 'bun:test';
import { extractProductHtml, extractProductPrice } from './extract-product-price';
import { jimmykeyChoice } from './jimmykey-size-stock';
import { resolveProductPrice } from './price-source-router';
import { JIMMYKEY_CODE as CODE, JIMMYKEY_PRODUCT_ID as ID, JIMMYKEY_SIZES as SIZES, JIMMYKEY_URL as URL_, everySize,
  jimmykeyElsewhere as elsewhere, jimmykeyPage as page, jimmykeySizeLink as link, jimmykeySizeList as list, jimmykeySoldOut as soldOut,
  type JimmykeyPage as Page } from './jimmykey.fixture';

// Only the first test reads the page as fetched (2026-09-22); every other size list,
// claim, identity and address below is made up from it.
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const read = (o: Page = {}) => extractProductHtml(page(o), o.url ?? URL_);
const price = { status: 'success', priceMinor: 69995, currency: 'TRY', source: 'json-ld' } as const;
const unknown = { ...price, availability: 'unknown' } as const;
const inStock = { ...price, availability: 'in_stock' } as const;
const outOfStock = { ...price, availability: 'out_of_stock' } as const;
const conflict = (reason: string) => ({ status: 'not_found', contradiction: true, error: `jimmykey page does not match the requested product: ${reason}` }) as const;
const noSize = { status: 'not_found', error: 'A jimmykey size cannot be verified' } as const;

test('the page as fetched: one size on sale, three sold out, a product-level InStock that is no size\'s stock', () => {
  expect(jimmykeyChoice(page(), URL_)).toEqual({ kind: 'bound', amountMinor: 69995, productId: ID, unclear: null, sizes: SIZES });
  expect(read()).toEqual(unknown);
});

test('mixed sizes keep the price and state no stock, whatever the product-level claim says', () => {
  expect(read({ availability: 'OutOfStock' })).toEqual(unknown);
  expect(read({ availability: null })).toEqual(unknown);
  // One sold-out size among sizes on sale is not every size on sale either.
  expect(read({ sizes: [...everySize(true).slice(0, 3), { ...SIZES[3]!, onSale: false }] })).toEqual(unknown);
});

test('every size stated in the product-level state keeps that state', () => {
  expect(read({ sizes: everySize(true) })).toEqual(inStock);
  expect(read({ sizes: everySize(false), availability: 'OutOfStock' })).toEqual(outOfStock);
  // A single size is every size.
  expect(read({ sizes: [{ id: '71', label: 'STD', onSale: true }] })).toEqual(inStock);
  // A size link stating data-stock=False is a sold-out size too.
  expect(read({ sizeList: list([], everySize(false).map(link).join(' ')), availability: 'OutOfStock' })).toEqual(outOfStock);
});

test('a product-level claim the sizes contradict is withheld', () => {
  expect(read({ sizes: everySize(true), availability: 'OutOfStock' })).toEqual(unknown);
  expect(read({ sizes: everySize(false), availability: 'InStock' })).toEqual(unknown);
});

test('an incomplete, repeated or unclear size list states no stock', () => {
  const xxl = { id: '90', label: 'XXL' };
  // Each unclear entry sits once among sizes all on sale under an in-stock claim and once
  // among sizes all sold out under an out-of-stock claim, so reading it either way would
  // show as a kept claim.
  for (const extra of [
    '<a data-id=90 class=XXL data-name=XXL href=javascript:void(0)>XXL</a>',
    '<a data-id=90 class=XXL data-name=XXL data-stock=Maybe href=javascript:void(0)>XXL</a>',
    '<a class=XXL data-name=XXL data-stock=True href=javascript:void(0)>XXL</a>',
    '<a data-id=90 data-stock=True href=javascript:void(0)>XXL</a>',
    '<a href=#SizeTable>Size chart</a>',
    soldOut(xxl).replace('<span class=noStockLine></span>', ''),
    soldOut(xxl).replace('class=NotifyWhen', 'class=Other'),
    soldOut(xxl).replace('<input type=hidden name=SizeIDs id=SizeIDs value=90>', ''),
    soldOut(xxl).replace('value=90>', 'value=90> <input type=hidden name=SizeIDs id=SizeIDs value=91>'),
    soldOut({ id: '90', label: '' }),
  ]) {
    expect(read({ sizeList: list(everySize(true), extra) })).toEqual(unknown);
    expect(read({ sizeList: list(everySize(false), extra), availability: 'OutOfStock' })).toEqual(unknown);
  }
  for (const sizeList of [
    list([...everySize(true), { id: '71', label: 'XXL', onSale: true }]),
    list([...everySize(true), { id: '90', label: 's', onSale: true }]),
    list([]),
  ]) {
    expect(read({ sizeList })).toEqual(unknown);
  }
});

test('an identity the page states against the address rejects the reading', () => {
  const other = 'https://www.jimmykey.com/en/another-blouse_5ww999999/haki/61';
  expect(read({ canonical: other })).toEqual(conflict('canonical'));
  expect(read({ sku: '5WW999999' })).toEqual(conflict('schema product code'));
  expect(read({ offerUrl: other })).toEqual(conflict('schema offer address'));
  expect(read({ productId: '99999' })).toEqual(conflict('product id'));
  expect(read({ activeProductId: '99999' })).toEqual(conflict('product id'));
  expect(read({ pageId: '99999' })).toEqual(conflict('product id'));
  expect(read({ colourId: '12' })).toEqual(conflict('colour'));
  expect(read({ currentColourId: '12' })).toEqual(conflict('colour'));
  expect(read({ activeColour: '12' })).toEqual(conflict('colour'));
  expect(read({ activeHref: '/en/-boat-neck-long-sleeve-patterned-mesh-knitted-blouse_5ww035617/black/12' })).toEqual(conflict('colour address'));
  expect(read({ basketCode: '5WW999999' })).toEqual(conflict('add-to-bag product code'));
  // The same page asked for at another colour's address.
  expect(read({ url: 'https://www.jimmykey.com/en/-boat-neck-long-sleeve-patterned-mesh-knitted-blouse_5ww035617/black/12' }))
    .toMatchObject({ status: 'not_found', contradiction: true });
  // The add-to-bag amount is the product's price; another amount leaves no price at all.
  expect(read({ basketAmount: '749.95' })).toEqual({ status: 'not_found', contradiction: true, error: 'jimmykey add-to-bag amount differs from the product price' });
  // An identity conflict is not a stock question: every size on sale changes nothing.
  expect(read({ sizes: everySize(true), colourId: '12' })).toEqual(conflict('colour'));
  expect(read({ sizes: everySize(true), basketAmount: '749.95' })).toMatchObject({ status: 'not_found', contradiction: true });
});

test('a block that cannot be bound keeps the price and states no stock', () => {
  const on = { sizes: everySize(true) } as const;
  const cases: Page[] = [
    { canonical: null }, { productId: null }, { colourId: null, currentColourId: null }, { activeColours: 0 }, { activeColours: 2 },
    { basketCode: null }, { basketAmount: null }, { basketAmount: '699,95' }, { sizeList: '' }, { blocks: 2 },
    { inBlock: list(everySize(true)) },
    { tail: `<div class=QuickView>${list(everySize(true))}</div>` },
    { tail: `<button type=button name=Basket id=Basket data-productcode=${CODE} data-amount=699.95>ADD</button>` },
    { tail: `<input type=hidden id=ProductID name=ProductID value=${ID}>` },
    // A second product block, even an empty one, leaves no single block to trust.
    { tail: '<div class=ProductContent></div>' },
  ];
  for (const o of cases) expect(read({ ...on, ...o })).toEqual(unknown);
  // No JSON-LD product code, or two products: nothing ties the block to the schema.
  expect(jimmykeyChoice(page({ ...on, sku: null }), URL_)).toEqual({ kind: 'unbound', reason: 'schema product' });
  const two = JSON.stringify([{ '@type': 'Product', sku: CODE }, { '@type': 'Product', sku: CODE }]);
  expect(jimmykeyChoice(page({ ...on, schema: two }), URL_)).toEqual({ kind: 'unbound', reason: 'schema product' });
  // An address without the colour names no size list.
  const colourless = 'https://www.jimmykey.com/en/-boat-neck-long-sleeve-patterned-mesh-knitted-blouse_5ww035617';
  expect(jimmykeyChoice(page(on), colourless)).toEqual({ kind: 'unbound', reason: 'the address names no product code and colour' });
  expect(extractProductHtml(page(on), colourless)).toMatchObject({ status: 'success', availability: 'unknown' });
});

test('sizes, ids and buttons outside the product block are not the product\'s', () => {
  // Every piece of a block, for another product and colour with every size on sale.
  const foreign = [list(everySize(true)), '<input type=hidden id=ProductID name=ProductID value=99999>',
    '<button type=button name=Basket id=Basket data-productcode=5WW999999 data-amount=10.00>ADD</button>',
    '<div class="ColorOptionItem color-item active"><a class=change-color href=/en/x_5ww999999/red/99 data-id=99 data-productid=99999></a></div>',
  ].join('');
  for (const tail of elsewhere(foreign)) {
    expect(read({ tail })).toEqual(unknown);
    expect(read({ tail, sizes: everySize(true) })).toEqual(inStock);
  }
  // Inside the block: the size chart is not a size list.
  expect(read({ sizes: everySize(true), inBlock: `<div class=SizeTable>${list(everySize(false))}</div>` })).toEqual(inStock);
});

// A chosen size is read only as jimmykey:<ProductID>:<ColorID>:<SizeID>
// (jimmykey-selected-size.test.ts); every other selection on this store is not.
test('a selection that is not a readable jimmykey identity is never read', () => {
  for (const selection of [`offer:${CODE}-M`, 'woo:1:2', 'ticimax:1:2', 'jimmykey:28615:86', '86']) {
    expect(read({ url: `${URL_}?_butika_variant=${encodeURIComponent(selection)}` })).toEqual(noSize);
  }
  // A plain variant parameter keeps the existing rule: the price, no stock.
  expect(read({ url: `${URL_}?variant=86`, sizes: everySize(true) })).toEqual(unknown);
});

test('a generic offer selection cannot stand in for a jimmykey size', () => {
  // Made-up JSON-LD with one offer per size, which the generic offer:<sku> contract reads.
  const offers = SIZES.map(size => ({ '@type': 'Offer', sku: `${CODE}-${size.label}`, url: URL_, price: 699.95, priceCurrency: 'TRY',
    availability: 'https://schema.org/InStock' }));
  const schema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Blouse', sku: CODE, offers });
  expect(read({ schema, url: `${URL_}?_butika_variant=offer:${CODE}-M` })).toEqual(noSize);
  // Control: on another store the same page is read by that contract.
  const other = 'https://www.example.com/en/-boat-neck-long-sleeve-patterned-mesh-knitted-blouse_5ww035617/haki/61';
  expect(extractProductHtml(page({ schema: schema.replaceAll(URL_, other), url: other }), `${other}?_butika_variant=offer:${CODE}-M`))
    .toMatchObject({ status: 'success', priceMinor: 69995, availability: 'in_stock' });
});

test('other addresses are untouched', () => {
  // The page as fetched keeps its product-level claim anywhere but https (www.)jimmykey.com.
  // (Tracking stores https addresses: canonicalize-url.ts.)
  const path = new URL(URL_).pathname;
  for (const url of [`https://www.example.com${path}`, `http://www.jimmykey.com${path}`, `https://www.jimmykey.com:8443${path}`,
    `https://jimmykey.com.example.com${path}`, `https://user@www.jimmykey.com${path}`]) {
    expect(jimmykeyChoice(page({ url }), url)).toEqual({ kind: 'other_host' });
    expect(extractProductHtml(page({ url }), url)).toEqual(inStock);
  }
  // Both spellings of the store are the store.
  const bare = `https://jimmykey.com${path}`;
  expect(read({ url: bare })).toEqual(unknown);
  expect(read({ url: bare, canonical: URL_ })).toEqual(unknown);
});

test('a chosen size is refused before anything is fetched', async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    requested.push(String(input instanceof Request ? input.url : input));
    throw new Error('no request expected');
  }) as unknown as typeof fetch;
  for (const selection of ['woo:1:2', `offer:${CODE}-M`]) {
    expect(await extractProductPrice(`${URL_}?_butika_variant=${encodeURIComponent(selection)}`)).toEqual(noSize);
  }
  expect(requested).toEqual([]);
});

test('no enrichment fills in a withheld stock', async () => {
  // Made up: the page also carries WooCommerce's body class, and the store API would say
  // in stock at the same price. The size list withheld the stock, so it is not asked.
  const requested: string[] = [];
  const woo = [{ slug: '61', prices: { price: '69995', currency_code: 'TRY', currency_minor_unit: 2 }, type: 'simple',
    is_in_stock: true, is_purchasable: true, is_on_backorder: false, stock_availability: { class: 'in-stock' } }];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    requested.push(href);
    if (href === URL_) return new Response(page({ bodyClass: 'woocommerce' }), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (href.startsWith('https://www.jimmykey.com/wp-json/wc/store/')) return Response.json(woo);
    throw new Error(`Unexpected request: ${href}`);
  }) as typeof fetch;
  expect(await extractProductPrice(URL_)).toEqual(unknown);
  expect(requested).toEqual([URL_]);
});

test('the full resolver keeps the withheld stock and lets no other source answer', async () => {
  const requested: string[] = [];
  let body = page();
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    requested.push(href);
    if (href === URL_) return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    throw new Error(`Unexpected request: ${href}`);
  }) as typeof fetch;
  // The page as fetched: the price, stock unknown, one request.
  const mixed = await resolveProductPrice({ url: URL_ });
  expect(mixed).toMatchObject({ status: 'success', observation: { priceMinor: 69995, currency: 'TRY', availability: 'unknown', provider: 'structured_html' } });
  expect(mixed.attempts.map(a => `${a.provider}:${a.status}`)).toEqual(['structured_html:success']);
  expect(requested).toEqual([URL_]);
  // A page that contradicts the address is refused, and no other provider is asked.
  requested.length = 0;
  body = page({ colourId: '12' });
  const refused = await resolveProductPrice({ url: URL_ });
  expect(refused).toMatchObject({ status: 'failed' });
  expect(refused.attempts.map(a => a.provider)).toEqual(['structured_html']);
  expect(requested).toEqual([URL_]);
  // A chosen size is refused before the page is fetched.
  requested.length = 0;
  const chosen = await resolveProductPrice({ url: `${URL_}?_butika_variant=${encodeURIComponent(`offer:${CODE}-M`)}` });
  expect(chosen).toMatchObject({ status: 'failed' });
  expect(requested).toEqual([]);
});
