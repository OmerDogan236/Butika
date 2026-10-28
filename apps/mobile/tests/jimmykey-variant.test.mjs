import { expect, test } from 'bun:test';
import vm from 'node:vm';
import { followSavedVariant, readVariants, singleVariantSave, variantCaptureScript, variantUrl } from '../src/lib/saved-variant.ts';
import { pageDocument } from './page-dom.mjs';

// The app's size picker and the server's reader on the same jimmykey.com colour page: the
// capture script runs against the page's markup, each offered size goes through
// variantUrl, and the server's own reader answers for that address. The page is the one
// fetched 2026-09-22 (apps/api/.../jimmykey.fixture.ts); every other state, colour page
// and failure below is made up. This is a test DOM, not a WebView on a phone; closing the
// picker without a choice is webview.tsx's own path and is not run here.
const fixture = await import(new URL('../../api/src/lib/price-tracking/jimmykey.fixture.ts', import.meta.url).href);
const { extractProductHtml } = await import(new URL('../../api/src/lib/price-tracking/extract-product-price.ts', import.meta.url).href);
const { JIMMYKEY_URL, JIMMYKEY_BLACK_URL, JIMMYKEY_PRODUCT_ID: ID, JIMMYKEY_SIZES: SIZES, everySize, jimmykeyPage: page,
  jimmykeyBlackPage: blackPage, jimmykeySizeList: list, jimmykeySizeLink: link, jimmykeySoldOut: soldOut, jimmykeyElsewhere: elsewhere } = fixture;

const metadata = `(function(){var payload={kind:'og',url:location.href,title:'Boat Neck Long Sleeve Patterned Mesh Knitted Blouse'};window.ReactNativeWebView.postMessage(JSON.stringify(payload));})(); true;`;

async function capture(html, { href = JIMMYKEY_URL, moveAway = false } = {}) {
  const messages = [];
  const url = new URL(href);
  const location = { href, hostname: url.hostname, pathname: url.pathname, protocol: url.protocol, port: url.port };
  const document = pageDocument(html);
  if (moveAway) {
    // The user leaves the page while the script is reading it.
    const query = document.querySelectorAll;
    document.querySelectorAll = selector => { location.href = JIMMYKEY_BLACK_URL; return query(selector); };
  }
  const fetch = async () => { throw new Error('No request is expected'); };
  vm.runInNewContext(variantCaptureScript(metadata, 'gesture-1'), {
    location, URL, AbortController, setTimeout, clearTimeout, document, fetch,
    window: { ReactNativeWebView: { postMessage: text => messages.push(JSON.parse(text)) } },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  return messages;
}

const offered = (size, available = size.onSale, colour = '61') => ({ id: `jimmykey:${ID}:${colour}:${size.id}`, title: size.label, available });
const asFetched = SIZES.map(size => offered(size));

test('the page as fetched offers every size with its product, colour and size, and the server reads each one the same way', async () => {
  const html = page();
  const [message] = await capture(html);
  expect(message.variantStatus).toBe('ready');
  expect(message.requestId).toBe('gesture-1');
  expect(message.variants).toEqual(asFetched);
  expect(readVariants(message.variants)).toEqual(message.variants);
  for (const variant of message.variants) {
    const chosen = variantUrl(message.url, variant.id);
    expect(chosen).toBe(`${JIMMYKEY_URL}?_butika_variant=${encodeURIComponent(variant.id)}`);
    expect(extractProductHtml(html, chosen)).toEqual({ status: 'success', priceMinor: 69995, currency: 'TRY',
      availability: variant.available ? 'in_stock' : 'out_of_stock', source: 'jimmykey' });
  }
});

test('every size on sale or every size sold out, under the opposite product-level claim: the picker and the server agree', async () => {
  for (const [html, available] of [[page({ sizes: everySize(true), availability: 'OutOfStock' }), true], [page({ sizes: everySize(false) }), false]]) {
    const [message] = await capture(html);
    expect(message.variants).toEqual(SIZES.map(size => offered(size, available)));
    for (const variant of message.variants)
      expect(extractProductHtml(html, variantUrl(message.url, variant.id))).toMatchObject({ availability: available ? 'in_stock' : 'out_of_stock' });
  }
});

test('a size link stating data-stock=False is offered as sold out (made up: no saved page shows one)', async () => {
  const html = page({ sizeList: list([], everySize(false).map(link).join(' ')) });
  const [message] = await capture(html);
  expect(message.variants).toEqual(SIZES.map(size => offered(size, false)));
  expect(extractProductHtml(html, variantUrl(message.url, message.variants[1].id))).toMatchObject({ availability: 'out_of_stock' });
});

test('another colour page offers its own sizes, and no size crosses to the other colour', async () => {
  const black = blackPage({ sizes: everySize(true) });
  const [message] = await capture(black, { href: JIMMYKEY_BLACK_URL });
  expect(message.variants).toEqual(SIZES.map(size => offered(size, true, '12')));
  const m = SIZES.find(size => size.id === '86');
  expect(extractProductHtml(black, variantUrl(message.url, offered(m, true, '12').id))).toMatchObject({ availability: 'in_stock' });
  expect(extractProductHtml(page(), variantUrl(JIMMYKEY_URL, offered(m).id))).toMatchObject({ availability: 'out_of_stock' });
  // The haki page's M on the black page, the black page's M on the haki page, or either on another store: never built.
  expect(() => variantUrl(JIMMYKEY_BLACK_URL, offered(m).id)).toThrow();
  expect(() => variantUrl(JIMMYKEY_URL, offered(m, true, '12').id)).toThrow();
  expect(() => variantUrl(JIMMYKEY_URL.replace('www.jimmykey.com', 'www.example.com'), offered(m).id)).toThrow();
});

test('recommendations, modals, combine items, the sticky bar and <template> never give the picker a size', async () => {
  const foreign = [list(everySize(true)), '<div class=ProductContent><input type=hidden id=ProductID value=99999></div>',
    '<div class="ColorOptionItem active"><a class=change-color href=/en/x_5ww999999/red/99 data-id=99 data-productid=99999></a></div>'].join('');
  const combine = `<div class="col-md-24 SuggestAndLast CombineItems"><div class=ProductContent>${list(everySize(true))}</div></div>`;
  for (const tail of [...elsewhere(foreign), combine]) {
    const [message] = await capture(page({ tail }));
    expect(message.variants).toEqual(asFetched);
  }
  // Inside the block: the size chart is not a size list.
  const [chart] = await capture(page({ inBlock: `<div class=SizeTable>${list(everySize(false))}</div>` }));
  expect(chart.variants).toEqual(asFetched);
});

const xxl = { id: '90', label: 'XXL' };
test.each([
  ['a second product block', { tail: '<div class=ProductContent></div>' }],
  ['no product id', { productId: null }],
  ['a product id that is not a number', { productId: 'x28615' }],
  ['no colour id', { colourId: null, currentColourId: null }],
  ['a colour other than the address', { colourId: '12' }],
  ['a current colour other than the colour', { currentColourId: '12' }],
  ['no active colour', { activeColours: 0 }],
  ['two active colours', { activeColours: 2 }],
  ['an active colour of another product', { activeProductId: '99999' }],
  ['an active colour pointing at another page', { activeHref: '/en/-boat-neck-long-sleeve-patterned-mesh-knitted-blouse_5ww035617/black/12' }],
  ['an add-to-bag button of another product', { basketCode: '5WW999999' }],
  ['an add-to-bag button without a product code', { basketCode: null }],
  ['a page product id of another product', { pageId: '99999' }],
  ['no canonical', { canonical: null }],
  ['a canonical of another page', { canonical: 'https://www.jimmykey.com/en/another-blouse_5ww999999/haki/61' }],
  ['no size list', { sizeList: '' }],
  ['two size lists', { inBlock: list(everySize(true)) }],
  ['a sold-out size without its SizeIDs', { sizeList: list(SIZES, soldOut(xxl).replace('<input type=hidden name=SizeIDs id=SizeIDs value=90>', '')) }],
  ['a sold-out size with two SizeIDs', { sizeList: list(SIZES, soldOut(xxl).replace('value=90>', 'value=90> <input type=hidden name=SizeIDs id=SizeIDs value=91>')) }],
  ['a sold-out size without its label', { sizeList: list(SIZES, soldOut(xxl).replace('<span class=inner>XXL</span>', '')) }],
  ['a sold-out size without its sold-out line', { sizeList: list(SIZES, soldOut(xxl).replace('<span class=noStockLine></span>', '')) }],
  ['a sold-out size without its notify link', { sizeList: list(SIZES, soldOut(xxl).replace('class=NotifyWhen', 'class=Other')) }],
  ['a sold-out size with two notify links', { sizeList: list(SIZES, soldOut(xxl).replace('</span> </span> </span>', '<a href=# class=NotifyWhen>Notify</a></span> </span> </span>')) }],
  ['a size link without its stock', { sizeList: list(SIZES, '<a data-id=90 class=XXL data-name=XXL href=javascript:void(0)>XXL</a>') }],
  ['a size link with an unreadable stock', { sizeList: list(SIZES, '<a data-id=90 class=XXL data-name=XXL data-stock=Maybe href=javascript:void(0)>XXL</a>') }],
  ['a size link without its id', { sizeList: list(SIZES, '<a class=XXL data-name=XXL data-stock=True href=javascript:void(0)>XXL</a>') }],
  ['a size link without its label', { sizeList: list(SIZES, '<a data-id=90 data-stock=True href=javascript:void(0)>XXL</a>') }],
  ['a size id that is not a number', { sizeList: list(SIZES, '<a data-id=X90 class=XXL data-name=XXL data-stock=True href=javascript:void(0)>XXL</a>') }],
  ['a size chart link among the sizes', { sizeList: list(SIZES, '<a href=#SizeTable>Size chart</a>') }],
  ['a size id twice', { sizes: [...SIZES, { id: '71', label: 'XXL', onSale: true }] }],
  ['a label twice', { sizes: [...SIZES, { id: '90', label: 's', onSale: true }] }],
  ['a sold-out size with an empty label', { sizeList: list(SIZES, soldOut({ id: '90', label: '' })) }],
])('%s: no picker and no silent save without a size', async (_, options) => {
  const [message] = await capture(page(options));
  expect(message.variantStatus).toBe('error');
  expect(message.variants).toBeUndefined();
});

test('only https on the store host, without a port', async () => {
  expect((await capture(page(), { href: JIMMYKEY_URL.replace('https:', 'http:') }))[0].variantStatus).toBe('error');
  expect((await capture(page(), { href: JIMMYKEY_URL.replace('.com/', '.com:8443/') }))[0].variantStatus).toBe('error');
});

test('other jimmykey pages keep plain metadata saving', async () => {
  const [message] = await capture('<!DOCTYPE html><html><body class=""><section class="new-products"></section></body></html>', { href: 'https://www.jimmykey.com/en' });
  expect(message.variantStatus).toBeUndefined();
  expect(message.variants).toBeUndefined();
});

test('a capture from a page the user has left is discarded', async () => {
  expect(await capture(page(), { moveAway: true })).toEqual([]);
});

test('a one-size jimmykey page still asks for a choice; other stores keep their single-option save', async () => {
  const [message] = await capture(page({ sizes: [{ id: '71', label: 'STD', onSale: true }] }));
  expect(message.variants).toEqual([offered({ id: '71', label: 'STD' }, true)]);
  expect(singleVariantSave(message.url, message.title, readVariants(message.variants))).toBeNull();
  expect(singleVariantSave('https://store.test/products/tee', 'Tee', [{ id: '123', title: 'Default Title', available: true }]))
    .toEqual({ url: 'https://store.test/products/tee?variant=123', title: 'Tee' });
});

test('the identity is lower case with three positive numbers', () => {
  const id = `jimmykey:${ID}:61:71`;
  expect(readVariants([{ id, title: 'S', available: true }])).not.toBeNull();
  for (const bad of [id.toUpperCase(), `Jimmykey:${ID}:61:71`, `jimmykey:${ID}:61`, `${id}:1`, `jimmykey:${ID}:61:0`, `jimmykey:${ID}:61:071`, `jimmykey:${ID}:haki:71`]) {
    expect(readVariants([{ id: bad, title: 'S', available: true }])).toBeNull();
    expect(() => variantUrl(JIMMYKEY_URL, bad)).toThrow();
  }
});

test('a save reply for a page the user has left does not pull the browser back', () => {
  expect(followSavedVariant(JIMMYKEY_URL, JIMMYKEY_URL)).toBe(true);
  expect(followSavedVariant(JIMMYKEY_URL, JIMMYKEY_BLACK_URL)).toBe(false);
  expect(followSavedVariant(undefined, JIMMYKEY_URL)).toBe(false);
});
