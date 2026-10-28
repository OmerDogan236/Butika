import { afterEach, expect, test } from 'bun:test';
import { bslChoice } from './bsl-size-stock';
import { BSL_PRODUCT_ID as ID, BSL_SIZES as SIZES, BSL_URL as URL_, bslElsewhere as elsewhere, bslEvery as every, bslPage as page,
  bslSizeLink as link, bslSizeList as list, bslSoldOut as soldOut, type BslPage as Page } from './bsl.fixture';
import { extractProductHtml, extractProductPrice } from './extract-product-price';
import { JIMMYKEY_URL, everySize as jimmykeyEvery, jimmykeyPage } from './jimmykey.fixture';
import { resolveProductPrice } from './price-source-router';

// Only the first test reads the page as saved (2026-09-09); every other size list, claim,
// identity and address below is made up from it.
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const read = (o: Page = {}) => extractProductHtml(page(o), o.url ?? URL_);
const price = { status: 'success', priceMinor: 114999, currency: 'TRY', source: 'json-ld' } as const;
const unknown = { ...price, availability: 'unknown' } as const;
const inStock = { ...price, availability: 'in_stock' } as const;
const outOfStock = { ...price, availability: 'out_of_stock' } as const;
const conflict = (reason: string) => ({ status: 'not_found', contradiction: true, error: `BSL page does not match the requested product: ${reason}` }) as const;
const noSize = { status: 'not_found', error: 'A BSL size cannot be verified' } as const;

test('the page as saved: four sizes on sale, L sold out, a product-level InStock that is no size\'s stock', () => {
  expect(bslChoice(page(), URL_)).toEqual({ kind: 'bound', amountMinor: 114999, unclear: null, sizes: SIZES });
  expect(read()).toEqual(unknown);
});

test('mixed sizes keep the price and state no stock, whatever the product-level claim says', () => {
  expect(read({ availability: 'OutOfStock' })).toEqual(unknown);
  expect(read({ availability: null })).toEqual(unknown);
  expect(read({ sizes: [...every(false).slice(0, 4), { ...SIZES[4]!, onSale: true }], availability: 'OutOfStock' })).toEqual(unknown);
});

test('every size stated in the product-level state keeps that state', () => {
  expect(read({ sizes: every(true) })).toEqual(inStock);
  expect(read({ sizes: every(false), availability: 'OutOfStock' })).toEqual(outOfStock);
  expect(read({ sizes: [{ id: '6', label: 'STD', onSale: true }] })).toEqual(inStock);
  // A size link stating data-stock=False is a sold-out size too.
  expect(read({ sizeList: list([], every(false).map(link).join(' ')), availability: 'OutOfStock' })).toEqual(outOfStock);
});

test('a product-level claim the sizes contradict is withheld', () => {
  expect(read({ sizes: every(true), availability: 'OutOfStock' })).toEqual(unknown);
  expect(read({ sizes: every(false), availability: 'InStock' })).toEqual(unknown);
});

test('an incomplete, repeated or unclear size list states no stock', () => {
  const xl = { id: '99', label: 'XL' };
  // Each unclear entry sits once among sizes all on sale under an in-stock claim and once
  // among sizes all sold out under an out-of-stock claim.
  for (const extra of [
    '<span class="selectSize"><a data-id="99" class="XL" data-name="XL" href="javascript:void(0)">XL</a></span>',
    '<span class="selectSize"><a data-id="99" class="XL" data-name="XL" data-stock="Maybe" href="javascript:void(0)">XL</a></span>',
    '<span class="selectSize"><a class="XL" data-name="XL" data-stock="True" href="javascript:void(0)">XL</a></span>',
    '<span class="selectSize"><a data-id="99" data-stock="True" href="javascript:void(0)">XL</a></span>',
    '<a href="#SizeTable">Beden Tablosu</a>',
    soldOut(xl).replace('class="NotifyWhen"', 'class="Other"'),
    soldOut(xl).replace('<input type="hidden" name="SizeIDs" id="SizeIDs" value="99" />', ''),
    soldOut(xl).replace('value="99" />', 'value="99" /> <input type="hidden" name="SizeIDs" id="SizeIDs" value="98" />'),
    soldOut({ id: '99', label: '' }),
    soldOut(xl).replace('</span> </span>', '</span> <span class="inner">XXL</span> </span>'),
  ]) {
    expect(read({ sizeList: list(every(true), extra) })).toEqual(unknown);
    expect(read({ sizeList: list(every(false), extra), availability: 'OutOfStock' })).toEqual(unknown);
  }
  for (const sizeList of [list([...every(true), { id: '11', label: 'XL', onSale: true }]), list([...every(true), { id: '99', label: 's', onSale: true }]), list([])]) {
    expect(read({ sizeList })).toEqual(unknown);
  }
});

test('an identity the page states against the address rejects the reading', () => {
  const other = 'https://www.bsl.com.tr/tr/baska-bir-etek_21049-175';
  expect(read({ canonical: other })).toEqual(conflict('canonical'));
  expect(read({ sku: '21048-320' })).toEqual(conflict('schema sku'));
  expect(read({ sku: '21049-175' })).toEqual(conflict('schema sku'));
  expect(read({ offerUrl: other })).toEqual(conflict('schema offer address'));
  expect(read({ productId: '99999' })).toEqual(conflict('product id'));
  expect(read({ activeProductId: '99999' })).toEqual(conflict('product id'));
  expect(read({ basketProductId: '99999' })).toEqual(conflict('product id'));
  expect(read({ pageId: '99999' })).toEqual(conflict('product id'));
  expect(read({ colourId: '320' })).toEqual(conflict('colour'));
  expect(read({ activeColour: '320' })).toEqual(conflict('colour'));
  expect(read({ basketCode: '21049' })).toEqual(conflict('add-to-bag product code'));
  // The same page asked for at the other colour's address.
  expect(read({ url: 'https://www.bsl.com.tr/tr/siyah-toka-ve-drape-detayli-midi-etek_21048-320' })).toMatchObject({ status: 'not_found', contradiction: true });
  // The add-to-bag amount is the product's price; another amount leaves no price at all.
  expect(read({ amount: '1249,99' })).toEqual({ status: 'not_found', contradiction: true, error: 'BSL add-to-bag amount differs from the product price' });
  // An identity conflict is not a stock question: every size on sale changes nothing.
  expect(read({ sizes: every(true), colourId: '320' })).toEqual(conflict('colour'));
});

test('a block that cannot be bound keeps the price and states no stock', () => {
  const on = { sizes: every(true) } as const;
  const cases: Page[] = [
    { canonical: null }, { productId: null }, { colourId: null }, { activeColours: 0 }, { activeColours: 2 },
    { basketCode: null }, { basketProductId: null }, { amount: null }, { amount: '1.149,99' }, { amount: '1149.99' }, { sizeList: '' }, { blocks: 2 },
    { inBlock: list(every(true)) },
    { tail: `<div class="QuickView">${list(every(true))}</div>` },
    { tail: `<button type="button" name="Basket" id="Basket" data-productcode="21048" data-productID="${ID}" data-productamount="1149,99">EKLE</button>` },
    { tail: `<input type="hidden" id="ProductID" name="ProductID" value="${ID}" />` },
    { tail: '<div class="ProductContent"></div>' },
  ];
  for (const o of cases) expect(read({ ...on, ...o })).toEqual(unknown);
  expect(bslChoice(page({ ...on, sku: null }), URL_)).toEqual({ kind: 'unbound', reason: 'schema product' });
  const two = JSON.stringify([{ '@type': 'Product', sku: '21048-175' }, { '@type': 'Product', sku: '21048-175' }]);
  expect(bslChoice(page({ ...on, schema: two }), URL_)).toEqual({ kind: 'unbound', reason: 'schema product' });
  // An address without the colour names no size list.
  const colourless = 'https://www.bsl.com.tr/tr/siyah-toka-ve-drape-detayli-midi-etek_21048';
  expect(bslChoice(page(on), colourless)).toEqual({ kind: 'unbound', reason: 'the address names no product code and colour' });
});

test('sizes, ids and buttons outside the product block are not the product\'s', () => {
  const foreign = [list(every(true)), '<input type="hidden" id="ProductID" name="ProductID" value="99999" />',
    '<button type="button" name="Basket" id="Basket" data-productcode="99999" data-productID="99999" data-productamount="10,00">EKLE</button>',
    '<div class="ColorOptionItem active"><a id="changeColor" href="javascript:" data-id="999" data-productid="99999"></a></div>'].join('');
  for (const tail of elsewhere(foreign)) {
    expect(read({ tail })).toEqual(unknown);
    expect(read({ tail, sizes: every(true) })).toEqual(inStock);
  }
  // Inside the block: the size chart is not a size list.
  expect(read({ sizes: every(true), inBlock: `<div class="find-table-size">${list(every(false))}</div>` })).toEqual(inStock);
});

test('a chosen size is never read: no size identity is verified for this store', () => {
  for (const selection of ['offer:21048-175-L', 'woo:1:2', 'ticimax:1:2', 'bsl:11745:10', '10']) {
    expect(read({ url: `${URL_}?_butika_variant=${encodeURIComponent(selection)}` })).toEqual(noSize);
  }
  // A plain variant parameter keeps the existing rule: the price, no stock.
  expect(read({ url: `${URL_}?variant=10`, sizes: every(true) })).toEqual(unknown);
});

test('a generic offer selection cannot stand in for a BSL size', () => {
  const offers = SIZES.map(size => ({ '@type': 'Offer', sku: `21048-175-${size.label}`, url: URL_, price: '1149.99', priceCurrency: 'TRY',
    availability: 'https://schema.org/InStock' }));
  const schema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Etek', sku: '21048-175', offers });
  expect(read({ schema, url: `${URL_}?_butika_variant=offer:21048-175-L` })).toEqual(noSize);
  // Control: on another store the same page is read by that contract.
  const other = 'https://www.example.com/tr/siyah-toka-ve-drape-detayli-midi-etek_21048-175';
  expect(extractProductHtml(page({ schema: schema.replaceAll(URL_, other), url: other }), `${other}?_butika_variant=offer:21048-175-L`))
    .toMatchObject({ status: 'success', priceMinor: 114999, availability: 'in_stock' });
});

test('other addresses are untouched, and Jimmy Key keeps its own rule', () => {
  const path = new URL(URL_).pathname;
  for (const url of [`https://www.example.com${path}`, `http://www.bsl.com.tr${path}`, `https://www.bsl.com.tr:8443${path}`,
    `https://bsl.com.tr.example.com${path}`, `https://user@www.bsl.com.tr${path}`]) {
    expect(bslChoice(page({ url }), url)).toEqual({ kind: 'other_host' });
    expect(extractProductHtml(page({ url }), url)).toEqual(inStock);
  }
  const bare = `https://bsl.com.tr${path}`;
  expect(read({ url: bare })).toEqual(unknown);
  // Jimmy Key: its guard answers as before, and the BSL guard never binds its pages.
  expect(bslChoice(jimmykeyPage(), JIMMYKEY_URL)).toEqual({ kind: 'other_host' });
  expect(extractProductHtml(jimmykeyPage(), JIMMYKEY_URL)).toMatchObject({ status: 'success', priceMinor: 69995, availability: 'unknown' });
  expect(extractProductHtml(jimmykeyPage({ sizes: jimmykeyEvery(true) }), JIMMYKEY_URL)).toMatchObject({ status: 'success', availability: 'in_stock' });
});

test('a chosen size is refused before anything is fetched', async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    requested.push(String(input instanceof Request ? input.url : input));
    throw new Error('no request expected');
  }) as unknown as typeof fetch;
  for (const selection of ['woo:1:2', 'offer:21048-175-L']) {
    expect(await extractProductPrice(`${URL_}?_butika_variant=${encodeURIComponent(selection)}`)).toEqual(noSize);
  }
  expect(requested).toEqual([]);
});

test('no enrichment fills in a withheld stock', async () => {
  // Made up: the page also carries WooCommerce's body class and the store API would say in
  // stock at the same price. The size list withheld the stock, so it is not asked.
  const requested: string[] = [];
  const store = [{ slug: 'siyah-toka-ve-drape-detayli-midi-etek_21048-175', prices: { price: '114999', currency_code: 'TRY', currency_minor_unit: 2 },
    type: 'simple', is_in_stock: true, is_purchasable: true, is_on_backorder: false, stock_availability: { class: 'in-stock' } }];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    requested.push(href);
    if (href === URL_) return new Response(page({ bodyClass: 'woocommerce' }), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (href.startsWith('https://www.bsl.com.tr/wp-json/wc/store/')) return Response.json(store);
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
  const mixed = await resolveProductPrice({ url: URL_ });
  expect(mixed).toMatchObject({ status: 'success', observation: { priceMinor: 114999, currency: 'TRY', availability: 'unknown', provider: 'structured_html' } });
  expect(mixed.attempts.map(a => `${a.provider}:${a.status}`)).toEqual(['structured_html:success']);
  expect(requested).toEqual([URL_]);
  requested.length = 0;
  body = page({ colourId: '320' });
  const refused = await resolveProductPrice({ url: URL_ });
  expect(refused).toMatchObject({ status: 'failed' });
  expect(refused.attempts.map(a => a.provider)).toEqual(['structured_html']);
  expect(requested).toEqual([URL_]);
  requested.length = 0;
  const chosen = await resolveProductPrice({ url: `${URL_}?_butika_variant=${encodeURIComponent('offer:21048-175-L')}` });
  expect(chosen).toMatchObject({ status: 'failed' });
  expect(requested).toEqual([]);
});
