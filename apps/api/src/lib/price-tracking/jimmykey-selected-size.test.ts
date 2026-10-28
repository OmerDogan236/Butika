import { afterEach, expect, test } from 'bun:test';
import { extractProductHtml, extractProductPrice } from './extract-product-price';
import { isJimmykeySelection, jimmykeySelectedSize, readJimmykeySelection } from './jimmykey-size-stock';
import { resolveProductPrice } from './price-source-router';
import { JIMMYKEY_BLACK_URL as BLACK, JIMMYKEY_PRODUCT_ID as ID, JIMMYKEY_SIZES as SIZES, JIMMYKEY_URL as URL_, everySize,
  jimmykeyBlackPage as blackPage, jimmykeyPage as page, jimmykeySizeLink as link, jimmykeySizeList as list, selectedUrl as chosen } from './jimmykey.fixture';

// A chosen jimmykey size, jimmykey:<ProductID>:<ColorID>:<SizeID>, read on its colour
// page. Only the first test reads the page as fetched 2026-09-22 (S on sale; M, L and XL
// sold out); every other size list, claim, price, colour page and identity below is made
// up from it. The two real colour pages of one product (6SW187118 blue/83 and white/518)
// are read by the offline check outside this repository, not here.
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const size = (availability: 'in_stock' | 'out_of_stock', priceMinor = 69995) =>
  ({ status: 'success', priceMinor, currency: 'TRY', availability, source: 'jimmykey' }) as const;
const rejected = (reason: string) => ({ status: 'not_found', error: `Selected jimmykey size cannot be verified: ${reason}` }) as const;
const contradicted = (reason: string) => ({ ...rejected(reason), contradiction: true }) as const;
const noSize = { status: 'not_found', error: 'A jimmykey size cannot be verified' } as const;
const html = (body: string) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });

test('the page as fetched: every size by its own state, at the colour page\'s price', () => {
  expect(readJimmykeySelection(chosen('71'))).toEqual({ sourceUrl: URL_, productId: ID, colourId: '61', variantId: '71' });
  expect(extractProductHtml(page(), chosen('71'))).toEqual(size('in_stock'));
  expect(extractProductHtml(page(), chosen('86'))).toEqual(size('out_of_stock'));
  for (const entry of SIZES) expect(extractProductHtml(page(), chosen(entry.id))).toEqual(size(entry.onSale ? 'in_stock' : 'out_of_stock'));
});

test('the product-level claim never stands in for the chosen size', () => {
  // The page as fetched says InStock for the product while M is sold out.
  expect(extractProductHtml(page({ availability: 'OutOfStock' }), chosen('71'))).toEqual(size('in_stock'));
  expect(extractProductHtml(page({ availability: null }), chosen('86'))).toEqual(size('out_of_stock'));
  expect(extractProductHtml(page({ sizes: everySize(true), availability: 'OutOfStock' }), chosen('86'))).toEqual(size('in_stock'));
  expect(extractProductHtml(page({ sizes: everySize(false) }), chosen('71'))).toEqual(size('out_of_stock'));
});

test('a size link stating data-stock=False is sold out (made up: no saved jimmykey page shows one)', () => {
  const sizeList = list([], everySize(false).map(link).join(' '));
  expect(extractProductHtml(page({ sizeList }), chosen('71'))).toEqual(size('out_of_stock'));
  expect(extractProductHtml(page({ sizeList: list([], everySize(true).map(link).join(' ')) }), chosen('71'))).toEqual(size('in_stock'));
});

test('the price is the colour page\'s own amount', () => {
  expect(extractProductHtml(page({ price: '599.95' }), chosen('71'))).toEqual(size('in_stock', 59995));
  expect(extractProductHtml(page({ price: '599.95' }), chosen('86'))).toEqual(size('out_of_stock', 59995));
});

test('the same product id and size id on another colour page is another selection', () => {
  // Made up: M on sale on black/12 while it is sold out on haki/61.
  const black = blackPage({ sizes: everySize(true) });
  expect(extractProductHtml(black, chosen('86', { colourId: '12', page: BLACK }))).toEqual(size('in_stock'));
  expect(extractProductHtml(page(), chosen('86'))).toEqual(size('out_of_stock'));
  // A colour-12 selection at the haki/61 address, or a haki selection at the black/12 address.
  for (const [body, url] of [[page(), chosen('86', { colourId: '12' })], [black, chosen('86', { page: BLACK })]] as const) {
    expect(readJimmykeySelection(url)).toMatchObject({ variantId: '' });
    expect(isJimmykeySelection(url)).toBe(true);
    expect(extractProductHtml(body, url)).toEqual(noSize);
  }
});

test('another product\'s id is not this page\'s size', () => {
  expect(extractProductHtml(page(), chosen('71', { productId: '28829' }))).toEqual(rejected('product identity'));
  expect(jimmykeySelectedSize(page(), chosen('71', { productId: '28829' }), { priceMinor: 69995 })).toEqual({ rejected: 'product identity' });
});

test('a size the page does not state, an unclear list or an unbound block gives no reading at all', () => {
  expect(extractProductHtml(page(), chosen('116'))).toEqual(rejected('size not on page'));
  // Made up: M gone from the list; M twice; an entry without its stock; a label twice.
  expect(extractProductHtml(page({ sizes: SIZES.filter(entry => entry.id !== '86') }), chosen('86'))).toEqual(rejected('size not on page'));
  expect(extractProductHtml(page({ sizes: [...SIZES, { id: '86', label: 'XXL', onSale: true }] }), chosen('71')))
    .toEqual(rejected('size list: a size id repeated'));
  expect(extractProductHtml(page({ sizes: [...SIZES, { id: '90', label: 'm', onSale: true }] }), chosen('71')))
    .toEqual(rejected('size list: a size label repeated'));
  expect(extractProductHtml(page({ sizeList: list(SIZES, '<a data-id=90 class=XXL data-name=XXL href=javascript:void(0)>XXL</a>') }), chosen('71')))
    .toEqual(rejected('size list: a size link without its id, label or stock'));
  expect(extractProductHtml(page({ blocks: 2 }), chosen('71'))).toEqual(rejected('product block: several product blocks'));
  expect(extractProductHtml(page({ canonical: null }), chosen('71'))).toEqual(rejected('product block: canonical'));
  expect(extractProductHtml(page({ sizeList: '' }), chosen('71'))).toEqual(rejected('product block: no size list'));
  // Neither a product-level price nor a stock stands in.
  for (const o of [{ blocks: 2 }, { sizes: SIZES.filter(entry => entry.id !== '86') }, { sizeList: '' }]) {
    const result = extractProductHtml(page(o), chosen('86'));
    expect(result.status).toBe('not_found');
    expect('priceMinor' in result || 'availability' in result).toBe(false);
  }
});

test('an identity or amount the page contradicts keeps the contradiction rule', () => {
  expect(extractProductHtml(page({ colourId: '12' }), chosen('71'))).toEqual(contradicted('page does not match the requested product: colour'));
  expect(extractProductHtml(page({ activeProductId: '99999' }), chosen('71'))).toEqual(contradicted('page does not match the requested product: product id'));
  expect(extractProductHtml(page({ canonical: 'https://www.jimmykey.com/en/another-blouse_5ww999999/haki/61' }), chosen('71')))
    .toEqual(contradicted('page does not match the requested product: canonical'));
  expect(extractProductHtml(page({ basketAmount: '749.95' }), chosen('71'))).toEqual(contradicted('add-to-bag amount differs from the product price'));
});

test('only one lower-case jimmykey:<ProductID>:<ColorID>:<SizeID> is read', () => {
  const bad = [`JIMMYKEY:${ID}:61:71`, `Jimmykey:${ID}:61:71`, `jimmykey:${ID}:61`, `jimmykey:${ID}:61:71:1`, `jimmykey:${ID}:61:071`,
    `jimmykey:${ID}:61:0`, `jimmykey:0${ID}:61:71`, `jimmykey:${ID}:61:S`, `jimmykey:${ID}:haki:71`, 'jimmykey::61:71',
    `jimmykey:${ID}:61:12345678901`, ` jimmykey:${ID}:61:71`];
  for (const value of bad) {
    const url = `${URL_}?_butika_variant=${encodeURIComponent(value)}`;
    expect(isJimmykeySelection(url)).toBe(true);
    expect(extractProductHtml(page(), url)).toEqual(noSize);
  }
  // Two parameters, even two readable ones.
  const two = `${chosen('71')}&_butika_variant=${encodeURIComponent(`jimmykey:${ID}:61:86`)}`;
  expect(isJimmykeySelection(two)).toBe(true);
  expect(extractProductHtml(page(), two)).toEqual(noSize);
  // An address without its colour names no colour to bind.
  const colourless = `https://www.jimmykey.com/en/-boat-neck-long-sleeve-patterned-mesh-knitted-blouse_5ww035617?_butika_variant=${encodeURIComponent(`jimmykey:${ID}:61:71`)}`;
  expect(isJimmykeySelection(colourless)).toBe(true);
  // An address without a selection is not a selection.
  expect(isJimmykeySelection(URL_)).toBe(false);
  expect(readJimmykeySelection(URL_)).toBeNull();
});

test('a jimmykey identity moved to another host, scheme or port starts no reading', async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    requested.push(String(input instanceof Request ? input.url : input));
    throw new Error('no request expected');
  }) as unknown as typeof fetch;
  const path = new URL(URL_).pathname;
  for (const origin of ['https://www.example.com', 'http://www.jimmykey.com', 'https://www.jimmykey.com:8443', 'https://jimmykey.com.example.com',
    'https://user@www.jimmykey.com']) {
    const url = `${origin}${path}?_butika_variant=${encodeURIComponent(`jimmykey:${ID}:61:71`)}`;
    expect(readJimmykeySelection(url)).toMatchObject({ variantId: '' });
    expect(await extractProductPrice(url)).toEqual({ status: 'not_found', error: 'Invalid selected variant identity' });
  }
  for (const value of [`JIMMYKEY:${ID}:61:71`, `jimmykey:${ID}:12:86`, 'offer:5WW035617-M']) {
    expect(await extractProductPrice(`${URL_}?_butika_variant=${encodeURIComponent(value)}`)).toEqual(noSize);
  }
  expect(requested).toEqual([]);
});

test('a readable selection fetches its colour page without it, once, with no enrichment', async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    requested.push(href);
    // Made up: the WooCommerce body class, which on other stores asks the store API.
    if (href === URL_) return html(page({ bodyClass: 'woocommerce' }));
    throw new Error(`Unexpected request: ${href}`);
  }) as typeof fetch;
  expect(await extractProductPrice(chosen('86'))).toEqual(size('out_of_stock'));
  expect(await extractProductPrice(chosen('71'))).toEqual(size('in_stock'));
  expect(requested).toEqual([URL_, URL_]);
});

test('the full resolver answers a chosen size from the page alone, and a lost size from nothing', async () => {
  const requested: string[] = [];
  let body = page();
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    requested.push(href);
    if (href === URL_) return html(body);
    throw new Error(`Unexpected request: ${href}`);
  }) as typeof fetch;
  const open = await resolveProductPrice({ url: chosen('71') });
  expect(open).toMatchObject({ status: 'success', observation: { priceMinor: 69995, currency: 'TRY', availability: 'in_stock', provider: 'structured_html' } });
  expect(open.attempts.map(a => `${a.provider}:${a.status}`)).toEqual(['structured_html:success']);
  const sold = await resolveProductPrice({ url: chosen('86') });
  expect(sold).toMatchObject({ status: 'success', observation: { availability: 'out_of_stock' } });
  expect(requested).toEqual([URL_, URL_]);
  requested.length = 0;
  body = page({ sizes: SIZES.filter(entry => entry.id !== '86') });
  const lost = await resolveProductPrice({ url: chosen('86') });
  expect(lost).toMatchObject({ status: 'failed' });
  expect(lost.attempts.map(a => a.provider)).toEqual(['structured_html']);
  expect(requested).toEqual([URL_]);
});

test('an address without a selection keeps the size-less rule', () => {
  expect(extractProductHtml(page(), URL_)).toEqual({ status: 'success', priceMinor: 69995, currency: 'TRY', availability: 'unknown', source: 'json-ld' });
  expect(extractProductHtml(page({ sizes: everySize(true) }), URL_)).toMatchObject({ availability: 'in_stock', source: 'json-ld' });
});
