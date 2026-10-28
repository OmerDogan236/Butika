import { expect, test } from 'bun:test';
import vm from 'node:vm';
import { variantCaptureScript, variantUrl } from '../src/lib/saved-variant.ts';
import { jimmykeyMobilePage, stickyBar, stickyBasket } from './jimmykey-mobile.fixture.mjs';
import { OBSERVED_FAVOURITE, OBSERVED_NOTIFY, favourite, notifyLink, soldOutPhonePage, whiteColour } from './jimmykey-soldout.fixture.mjs';
import { pageDocument } from './page-dom.mjs';

// The size picker on a jimmykey.com colour sold out in every size: no add-to-bag button, the
// notify-me link a#NotAdd in its place (in the sticky bar's slot on a phone), the product code
// only on the block's favourite button (jimmykey-soldout.fixture.mjs keeps the markup observed
// on the phone apart from the made-up variations). Every size is offered as sold out, so that
// the user can save one and ask to be told when it is back; the server reads the same chosen
// size from the server page. This is a test DOM, not a WebView.
const fixture = await import(new URL('../../api/src/lib/price-tracking/jimmykey.fixture.ts', import.meta.url).href);
const { extractProductHtml } = await import(new URL('../../api/src/lib/price-tracking/extract-product-price.ts', import.meta.url).href);
const { JIMMYKEY_SOLD_OUT_URL: URL_, JIMMYKEY_SOLD_OUT_PRODUCT: PRODUCT, JIMMYKEY_SOLD_OUT_SIZES: SIZES, JIMMYKEY_URL, jimmykeyElsewhere,
  jimmykeySoldOutPage } = fixture;
const BLUE_URL = URL_.replace('/white/518', '/blue/83');

const metadata = `(function(){var payload={kind:'og',url:location.href,title:'100% Cotton High Waist Denim Pants'};window.ReactNativeWebView.postMessage(JSON.stringify(payload));})(); true;`;

async function capture(html, { href = URL_, moveAway = false } = {}) {
  const messages = [];
  const url = new URL(href);
  const location = { href, hostname: url.hostname, pathname: url.pathname, protocol: url.protocol, port: url.port };
  const document = pageDocument(html);
  if (moveAway) {
    const query = document.querySelectorAll;
    document.querySelectorAll = selector => { location.href = BLUE_URL; return query(selector); };
  }
  vm.runInNewContext(variantCaptureScript(metadata, 'gesture-1'), {
    location, URL, AbortController, setTimeout, clearTimeout, document, fetch: async () => { throw new Error('No request is expected'); },
    window: { ReactNativeWebView: { postMessage: text => messages.push(JSON.parse(text)) } },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  return messages;
}
const offered = SIZES.map(size => ({ id: `jimmykey:${PRODUCT.id}:518:${size.id}`, title: size.label, available: false }));

test('the phone page as observed offers every size sold out, and the server reads each chosen size sold out from its page', async () => {
  const [message] = await capture(soldOutPhonePage());
  expect(message.variantStatus).toBe('ready');
  expect(message.variants).toEqual(offered);
  for (const variant of message.variants)
    expect(extractProductHtml(jimmykeySoldOutPage(), variantUrl(message.url, variant.id)))
      .toEqual({ status: 'success', priceMinor: 169995, currency: 'TRY', availability: 'out_of_stock', source: 'jimmykey' });
  // The server page as a desktop shows it, the link still in the block, offers the same.
  expect((await capture(jimmykeySoldOutPage()))[0].variants).toEqual(offered);
  // A layout keeping the block's own link as well: the same product's copies agree.
  expect((await capture(soldOutPhonePage({ keepInBlock: true, bar: [whiteColour()] })))[0].variants).toEqual(offered);
});

test.each([
  ['no favourite button', { favouriteMarkup: '' }],
  ['a favourite button of another product id', { favouriteMarkup: OBSERVED_FAVOURITE.replace('data-id="29580"', 'data-id="99999"') }],
  ['a favourite button without its product id', { favouriteMarkup: OBSERVED_FAVOURITE.replace(' data-id="29580"', '') }],
  ['a favourite button with another product code', { favouriteMarkup: OBSERVED_FAVOURITE.replace('6SW187118', '6SW999999') }],
  ['a favourite that is not a button', { favouriteMarkup: favourite({ tag: 'div' }) }],
  ['a second favourite with a code in the block', { inBlock: favourite() }],
  ['a favourite with a code in an unknown place on the page', { tail: `<div class=QuickLook>${favourite({ id: '99999', code: '6SW999999' })}</div>` }],
  ['the link naming another colour', { slot: [notifyLink({ colourId: '83' })] }],
  ['the link naming another product', { slot: [notifyLink({ productId: '99999' })] }],
  ['a link without its RemindMe class', { slot: [notifyLink({ className: 'CartButtonColor' })] }],
  ['two links in the bar\'s slot', { slot: [OBSERVED_NOTIFY, OBSERVED_NOTIFY] }],
  ['a link elsewhere in the bar', { extra: OBSERVED_NOTIFY }],
  ['a link in an unknown place on the page', { tail: `<div class=QuickLook>${OBSERVED_NOTIFY}</div>` }],
  ['an add-to-bag button beside the link', { slot: [OBSERVED_NOTIFY, stickyBasket('6SW187118')] }],
  ['an add-to-bag button instead of the link, without its code', { slot: [stickyBasket(null)] }],
  ['neither a button nor a link', { slot: [] }],
  ['the block keeping a link of another colour', { keepInBlock: true, notify: { colourId: '83' } }],
  ['a bar left over from the blue colour', { bar: [whiteColour({ id: '83', path: new URL(BLUE_URL).pathname, title: 'BLUE' })],
    popup: [], slot: [notifyLink({ colourId: '83' })] }],
  ['a size on sale beside the link', { sizes: SIZES.map(size => ({ ...size, onSale: size.id === '87' })) }],
])('%s: no picker and no silent save without a size', async (_, options) => {
  const [message] = await capture(soldOutPhonePage(options));
  expect(message.variantStatus).toBe('error');
  expect(message.variants).toBeUndefined();
});

test.each([
  ['two links in the block', { inBlock: notifyLink() }],
  ['the block\'s link without its RemindMe class', { notify: { className: 'CartButtonColor' } }],
  ['the block\'s link beside a button', { basket: true }],
])('the page as a desktop shows it, %s: no picker', async (_, options) => {
  const [message] = await capture(jimmykeySoldOutPage(options));
  expect(message.variantStatus).toBe('error');
  expect(message.variants).toBeUndefined();
});

test('links and favourites in recommendations, modals and templates never matter', async () => {
  const foreign = [notifyLink({ productId: '99999', colourId: '99' }), favourite({ id: '99999', code: '6SW999999' }),
    stickyBar({ bar: [whiteColour({ productId: '99999' })], basket: [notifyLink({ productId: '99999' })] })].join('');
  for (const tail of jimmykeyElsewhere(foreign))
    expect({ tail: tail.slice(0, 30), variants: (await capture(soldOutPhonePage({ tail })))[0].variants }).toEqual({ tail: tail.slice(0, 30), variants: offered });
});

test('a page with an add-to-bag button keeps its own rule: its favourite button plays no part', async () => {
  // The haki/61 phone page, its favourite button of another product: the button's code decides.
  const [message] = await capture(jimmykeyMobilePage({ favourite: { id: '99999', code: '6SW999999' } }), { href: JIMMYKEY_URL });
  expect(message.variantStatus).toBe('ready');
});

test('a capture from a page the user has left is discarded', async () => {
  expect(await capture(soldOutPhonePage(), { moveAway: true })).toEqual([]);
});
