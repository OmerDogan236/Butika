import { expect, test } from 'bun:test';
import vm from 'node:vm';
import { variantCaptureScript, variantUrl } from '../src/lib/saved-variant.ts';
import { jimmykeyMobilePage, stickyBar, stickyBasket, stickyColour } from './jimmykey-mobile.fixture.mjs';
import { pageDocument } from './page-dom.mjs';

// The size picker on jimmykey.com as a phone renders the colour page: the active colour and the
// add-to-bag button live in the sticky bar (see jimmykey-mobile.fixture.mjs), not in the product
// block. The product block still gives the product, the colour and the sizes; the bar is read
// only as the same product's own copy, and anything unclear leaves the page without a picker.
// This is a test DOM, not a WebView; the server reads the static page, as in production.
const fixture = await import(new URL('../../api/src/lib/price-tracking/jimmykey.fixture.ts', import.meta.url).href);
const { extractProductHtml } = await import(new URL('../../api/src/lib/price-tracking/extract-product-price.ts', import.meta.url).href);
const { JIMMYKEY_URL, JIMMYKEY_BLACK_URL, JIMMYKEY_PRODUCT_ID: ID, JIMMYKEY_SIZES: SIZES, everySize, jimmykeyPage, jimmykeyElsewhere } = fixture;
const BLACK_PATH = new URL(JIMMYKEY_BLACK_URL).pathname;
const HAKI_PATH = new URL(JIMMYKEY_URL).pathname;

const metadata = `(function(){var payload={kind:'og',url:location.href,title:'Boat Neck Long Sleeve Patterned Mesh Knitted Blouse'};window.ReactNativeWebView.postMessage(JSON.stringify(payload));})(); true;`;

async function capture(html, { href = JIMMYKEY_URL, moveAway = false } = {}) {
  const messages = [];
  const url = new URL(href);
  const location = { href, hostname: url.hostname, pathname: url.pathname, protocol: url.protocol, port: url.port };
  const document = pageDocument(html);
  if (moveAway) {
    const query = document.querySelectorAll;
    document.querySelectorAll = selector => { location.href = JIMMYKEY_BLACK_URL; return query(selector); };
  }
  vm.runInNewContext(variantCaptureScript(metadata, 'gesture-1'), {
    location, URL, AbortController, setTimeout, clearTimeout, document, fetch: async () => { throw new Error('No request is expected'); },
    window: { ReactNativeWebView: { postMessage: text => messages.push(JSON.parse(text)) } },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  return messages;
}
const offered = (size, available = size.onSale, colour = '61') => ({ id: `jimmykey:${ID}:${colour}:${size.id}`, title: size.label, available });
const asFetched = SIZES.map(size => offered(size));

test('the phone layout offers the page\'s own sizes, and the server reads each chosen size from the static page', async () => {
  const [message] = await capture(jimmykeyMobilePage());
  expect(message.variantStatus).toBe('ready');
  expect(message.variants).toEqual(asFetched);
  for (const variant of message.variants)
    expect(extractProductHtml(jimmykeyPage(), variantUrl(message.url, variant.id))).toEqual({ status: 'success', priceMinor: 69995, currency: 'TRY',
      availability: variant.available ? 'in_stock' : 'out_of_stock', source: 'jimmykey' });
  // The desktop page is unchanged, and so is a layout that keeps the block's own copies too.
  expect((await capture(jimmykeyPage()))[0].variants).toEqual(asFetched);
  expect((await capture(jimmykeyMobilePage({ keepInBlock: true })))[0].variants).toEqual(asFetched);
});

test('only the bar\'s colour row, its pop-up and its add-to-bag slot count, one copy each at most', async () => {
  expect((await capture(jimmykeyMobilePage({ bars: [stickyBar({ popup: [] })] })))[0].variants).toEqual(asFetched);
  expect((await capture(jimmykeyMobilePage({ bars: [stickyBar({ bar: [] })] })))[0].variants).toEqual(asFetched);
});

test.each([
  ['the bar\'s colour of another product', { bars: [stickyBar({ bar: [stickyColour({ productId: '99999' })] })] }],
  ['the pop-up\'s colour of another colour', { bars: [stickyBar({ popup: [stickyColour({ id: '12', popup: true })] })] }],
  ['the bar\'s colour pointing at another page', { bars: [stickyBar({ bar: [stickyColour({ path: BLACK_PATH })] })] }],
  ['the bar\'s add-to-bag button of another product', { bars: [stickyBar({ basket: [stickyBasket('5WW999999')] })] }],
  ['the bar\'s add-to-bag button without a product code', { bars: [stickyBar({ basket: [stickyBasket(null)] })] }],
  ['two active colours in the bar\'s row', { bars: [stickyBar({ bar: [stickyColour(), stickyColour()] })] }],
  ['two add-to-bag buttons in the bar', { bars: [stickyBar({ basket: [stickyBasket(), stickyBasket()] })] }],
  ['two sticky bars', { bars: [stickyBar(), stickyBar()] }],
  ['an active colour elsewhere in the bar', { bars: [stickyBar({ extra: stickyColour() })] }],
  ['an add-to-bag button elsewhere in the bar', { bars: [stickyBar({ extra: stickyBasket() })] }],
  ['no active colour anywhere', { bars: [stickyBar({ bar: [], popup: [] })] }],
  ['no add-to-bag button anywhere', { bars: [stickyBar({ basket: [] })] }],
  ['a copy without its colour link', { bars: [stickyBar({ popup: [stickyColour({ popup: true, link: false })] })] }],
  ['no bar at all', { bars: [] }],
  ['an active colour in an unknown place on the page', { tail: `<div class=QuickLook>${stickyColour()}</div>` }],
  ['an add-to-bag button in an unknown place on the page', { tail: `<div class=QuickLook>${stickyBasket()}</div>` }],
  ['the block\'s colour and the bar\'s disagreeing', { keepInBlock: true, bars: [stickyBar({ bar: [stickyColour({ id: '12', path: BLACK_PATH })] })] }],
  ['the block\'s button and the bar\'s disagreeing', { keepInBlock: true, bars: [stickyBar({ basket: [stickyBasket('5WW999999')] })] }],
  ['the product id on the page disagreeing', { pageId: '99999' }],
])('%s: no picker and no silent save without a size', async (_, options) => {
  const [message] = await capture(jimmykeyMobilePage(options));
  expect(message.variantStatus).toBe('error');
  expect(message.variants).toBeUndefined();
});

test('recommendations, modals and templates around the phone layout still never matter', async () => {
  const foreign = [stickyBar({ bar: [stickyColour({ productId: '99999' })], basket: [stickyBasket('5WW999999')] }),
    `<div class="ColorOptionItem active"><a class=change-color href=/en/x_5ww999999/red/99 data-id=99 data-productid=99999></a></div>`].join('');
  for (const tail of jimmykeyElsewhere(foreign)) expect({ tail: tail.slice(0, 30), variants: (await capture(jimmykeyMobilePage({ tail })))[0].variants })
    .toEqual({ tail: tail.slice(0, 30), variants: asFetched });
});

test('another colour page offers its own colour, and a bar left over from the previous colour is refused', async () => {
  const black = { url: JIMMYKEY_BLACK_URL, colourId: '12', activeColour: '12', activeHref: BLACK_PATH, otherColour: { id: '61', path: HAKI_PATH }, sizes: everySize(true) };
  const own = stickyBar({ bar: [stickyColour({ id: '12', path: BLACK_PATH, title: 'BLACK' })], popup: [stickyColour({ id: '12', path: BLACK_PATH, title: 'BLACK', popup: true })] });
  expect((await capture(jimmykeyMobilePage({ ...black, bars: [own] }), { href: JIMMYKEY_BLACK_URL }))[0].variants)
    .toEqual(SIZES.map(size => offered(size, true, '12')));
  const [stale] = await capture(jimmykeyMobilePage({ ...black, bars: [stickyBar()] }), { href: JIMMYKEY_BLACK_URL });
  expect(stale.variantStatus).toBe('error');
});

test('a capture from a page the user has left is discarded', async () => {
  expect(await capture(jimmykeyMobilePage(), { moveAway: true })).toEqual([]);
});
