import { expect, test } from 'bun:test';
import vm from 'node:vm';
import { readVariants, variantCaptureScript, variantUrl } from '../src/lib/saved-variant.ts';
import { HOST, LOCATION, OTHER, PRODUCT, SLUG, VARIANTS, head, homeData, offered, productData, variant } from './ikas.fixture.mjs';
import { pageDocument } from './page-dom.mjs';

// The size picker on IKAS storefronts. The page data below is made up on an .test host, in the
// shape measured on vayustore.com on 2026-09-27 (claude-yamalar/2026-09-27-duzeltmeler/kanit/
// ikas-vayu-spa-olcumu-2026-09-27.md): a product page loaded in full keeps its data only in
// window.__NEXT_DATA__ (the store removes the script after load); after a move inside the
// store, window.__NEXT_DATA__ and the script still describe the first page loaded, while the
// document's navigation entry names the address it was loaded at and the store rewrites the
// head: one canonical, and on a product page one JSON-LD Product whose Offer is at its address
// (claude-yamalar/2026-09-27-dar-kapsam/ikas-spa/vayu-bas-olcumu-2026-09-27.md); the data and the
// head are in ikas.fixture.mjs.
const { readIkasSelection } = await import(new URL('../../api/src/lib/price-tracking/ikas-stock.ts', import.meta.url).href);

const metadata = `(function(){var payload={kind:'og',url:location.href,title:'Afrodit'};window.ReactNativeWebView.postMessage(JSON.stringify(payload));})(); true;`;
// loadedAt: the path the document's navigation entry names; left out, the page has no
// navigation entries at all.
async function capture({ path = `/${SLUG}`, script, window: next, modern, extraWindow = {}, head: pageHead = '', loadedAt } = {}) {
  const href = `${HOST}${path}`;
  const url = new URL(href);
  const scripts = [script].flat().filter(s => s !== undefined).map(s => `<script id=__NEXT_DATA__ type=application/json>${typeof s === 'string' ? s : JSON.stringify(s)}</script>`).join('');
  const messages = [];
  vm.runInNewContext(variantCaptureScript(metadata, 'gesture-1'), {
    location: { href, hostname: url.hostname, pathname: url.pathname, protocol: url.protocol, port: url.port }, URL, AbortController, setTimeout, clearTimeout,
    document: pageDocument(`<html><head>${pageHead}${scripts}</head><body></body></html>`),
    fetch: async () => { throw new Error('No request is expected'); },
    window: { __NEXT_DATA__: next, __IKAS_DATA__: modern, ...extraWindow, ReactNativeWebView: { postMessage: text => messages.push(JSON.parse(text)) } },
    ...(loadedAt === undefined ? {} : { performance: { getEntriesByType: type => (type === 'navigation' ? [{ name: `${HOST}${loadedAt}` }] : []) } }),
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  return messages[0];
}

test('a product page loaded in full offers its sizes from window data alone, and the server reads the chosen identity', async () => {
  const message = await capture({ window: productData() });
  expect(message.variantStatus).toBe('ready');
  expect(message.variants).toEqual(offered());
  expect(readVariants(message.variants)).not.toBeNull();
  const saved = variantUrl(message.url, message.variants[1].id);
  expect(readIkasSelection(saved)).toEqual({ sourceUrl: `${HOST}/${SLUG}?vid=${VARIANTS[1].id}`, productId: PRODUCT, variantId: VARIANTS[1].id });
  // The same page with its script still in place, and the modern data alone, offer the same.
  expect((await capture({ script: productData(), window: productData() })).variants).toEqual(offered());
  expect((await capture({ script: productData() })).variants).toEqual(offered());
  const { pageSpecificData, configJson } = productData().props.pageProps;
  expect((await capture({ modern: { pageType: 'PRODUCT', pageSpecificData, storefrontConfig: configJson } })).variants).toEqual(offered());
});

test('the slug is matched decoded, under an alias path and under a locale prefix', async () => {
  const turkish = productData({ slug: 'ürün-ağır' });
  expect((await capture({ path: '/%C3%BCr%C3%BCn-a%C4%9F%C4%B1r', window: turkish })).variantStatus).toBe('ready');
  expect((await capture({ path: `/products/${SLUG}`, window: productData({ querySlug: null }) })).variantStatus).toBe('ready');
  expect((await capture({ path: `/en/${SLUG}/`, window: productData({ querySlug: null }) })).variantStatus).toBe('ready');
});

test('data left from the first page never names this page\'s sizes, even where nothing tells a move', async () => {
  // Neither a navigation entry nor a head: another product's data is refused, not saved without a size.
  const fromOther = await capture({ path: '/hera-sporcu-sutyeni', window: productData() });
  expect(fromOther.variantStatus).toBe('error');
  expect(fromOther.variants).toBeUndefined();
  // The home page's data, and nothing on the page stating a product: saved as that page, as before.
  const fromHome = await capture({ script: homeData(), window: homeData() });
  expect(fromHome.variantStatus).toBeUndefined();
  expect(fromHome.variants).toBeUndefined();
});

const HERA = '/hera-sporcu-sutyeni';
const CATEGORY = '/spor-giyim';
const noSize = message => ({ status: message.variantStatus, variants: message.variants });

test('a move from the home page or a category to a product: their data never names its sizes, and the page asks for a reload', async () => {
  for (const from of ['/', CATEGORY]) {
    expect(noSize(await capture({ path: HERA, script: homeData(), window: homeData(), head: head({ path: HERA }), loadedAt: from })))
      .toEqual({ status: 'stale', variants: undefined });
  }
  // A product of one size, too: its data is not there to tell.
  expect(noSize(await capture({ path: '/tek-beden', window: homeData(), head: head({ path: '/tek-beden' }), loadedAt: '/' })))
    .toEqual({ status: 'stale', variants: undefined });
});

test('a move from product A to product B asks for a reload, whether B\'s head is written yet or not', async () => {
  for (const pageHead of [head({ path: HERA }), head({ path: `/${SLUG}` }), head({ path: HERA, canonical: null }), '',
    `${head({ path: HERA })}<script type="application/ld+json">{"@type":</script>`]) {
    expect(noSize(await capture({ path: HERA, window: productData(), head: pageHead, loadedAt: `/${SLUG}` }))).toEqual({ status: 'stale', variants: undefined });
  }
});

test('a move to a page whose head states this address and no product is saved as that page, as before', async () => {
  const plain = head({ path: CATEGORY, product: false });
  for (const [data, from] of [[homeData(), '/'], [productData(), `/${SLUG}`]]) {
    expect(noSize(await capture({ path: CATEGORY, window: data, head: plain, loadedAt: from }))).toEqual({ status: undefined, variants: undefined });
  }
  // A head for another address, none, or JSON-LD it cannot read cannot say so.
  for (const pageHead of [head({ path: '/', product: false }), head({ path: CATEGORY, product: false, canonical: null }),
    `${head({ path: CATEGORY, product: false })}<script type="application/ld+json">{"@type":</script>`]) {
    expect((await capture({ path: CATEGORY, window: homeData(), head: pageHead, loadedAt: '/' })).variantStatus).toBe('stale');
  }
});

test('after the reload the page is loaded at its address: its own sizes, or an error that asks for no second reload', async () => {
  const fresh = await capture({ window: productData(), head: head(), loadedAt: `/${SLUG}` });
  expect(fresh.variantStatus).toBe('ready');
  expect(fresh.variants).toEqual(offered());
  // Still another product's data, or still the home page's under this product's head.
  expect(noSize(await capture({ path: HERA, window: productData(), head: head({ path: HERA }), loadedAt: HERA }))).toEqual({ status: 'error', variants: undefined });
  expect(noSize(await capture({ path: HERA, window: homeData(), head: head({ path: HERA }), loadedAt: HERA }))).toEqual({ status: 'error', variants: undefined });
  // Without a navigation entry the same: never stale, never a save without a size.
  expect(noSize(await capture({ path: HERA, window: homeData(), head: head({ path: HERA }) }))).toEqual({ status: 'error', variants: undefined });
});

test('broken or disagreeing page data after a move is an error, not a reason to reload', async () => {
  for (const page of [{ script: '{"props":', window: productData() },
    { script: productData(), window: productData({ variants: [...VARIANTS, variant(4, 'Siyah', 'M')] }) },
    { window: productData({ id: '12345' }) }]) {
    expect(noSize(await capture({ ...page, head: head(), loadedAt: '/' }))).toEqual({ status: 'error', variants: undefined });
  }
});

test('pages loaded at their address keep their rules: a home page and a category are saved as pages, a one-size product too', async () => {
  expect((await capture({ path: '/', script: homeData(), window: homeData(), head: head({ path: '/', product: false }), loadedAt: '/' })).variantStatus).toBeUndefined();
  expect((await capture({ path: CATEGORY, window: homeData(), head: head({ path: CATEGORY, product: false }), loadedAt: CATEGORY })).variantStatus).toBeUndefined();
  const one = productData({ slug: 'tek-beden', variants: [VARIANTS[0]] });
  expect((await capture({ path: '/tek-beden', window: one, head: head({ path: '/tek-beden' }), loadedAt: '/tek-beden' })).variantStatus).toBeUndefined();
  // A one-size product whose data names it under another slug, loaded at this address: as before.
  const alias = productData({ slug: 'eski-ad', variants: [VARIANTS[0]] });
  expect((await capture({ path: '/tek-beden', window: alias, head: head({ path: '/tek-beden' }), loadedAt: '/tek-beden' })).variantStatus).toBeUndefined();
});

test.each([
  ['the script and the window disagree on a size', { script: productData(), window: productData({ variants: [...VARIANTS, variant(4, 'Siyah', 'M')] }) }],
  ['the script and the window disagree on stock', { script: productData(), window: productData({ variants: [VARIANTS[0], VARIANTS[1], variant(3, 'Siyah', 'XS/S', 0)] }) }],
  ['the script is the first page, the window this product', { script: homeData(), window: productData() }],
  ['the script cannot be read', { script: '{"props":', window: productData() }],
  ['two scripts', { script: [productData(), productData()], window: productData({ variants: [...VARIANTS, variant(4, 'Siyah', 'M')] }) }],
  ['the modern data and Next\'s disagree', { window: productData(), modern: { pageType: 'PRODUCT', pageSpecificData: { ...productData().props.pageProps.pageSpecificData, id: OTHER }, storefrontConfig: { stockLocationIds: [LOCATION] } } }],
  ['a product id that is not a UUID', { window: productData({ id: '12345' }) }],
  ['a size of another product', { window: productData({ variants: [...VARIANTS, { ...variant(4, 'Siyah', 'M'), productId: OTHER }] }) }],
  ['a size id that is not a UUID', { window: productData({ variants: [...VARIANTS, { ...variant(4, 'Siyah', 'M'), id: 'x-4' }] }) }],
  ['a size id twice', { window: productData({ variants: [...VARIANTS, VARIANTS[0]] }) }],
  ['a size without its label', { window: productData({ variants: [...VARIANTS, { ...variant(4, 'Siyah', 'M'), variantValues: [] }] }) }],
  ['no slug', { window: { ...productData(), props: { pageProps: { ...productData().props.pageProps, pageSpecificData: { ...productData().props.pageProps.pageSpecificData, metaData: {} } } } } }],
  ['another page type', { window: productData({ pageType: 'CATEGORY' }) }],
  ['a query naming another page', { window: productData({ querySlug: 'hera-sporcu-sutyeni' }) }],
  ['every size deleted', { window: productData({ variants: VARIANTS.map(v => ({ ...v, deleted: true })) }) }],
])('%s: no picker and no silent save without a size', async (_, page) => {
  const message = await capture(page);
  expect(message.variantStatus).toBe('error');
  expect(message.variants).toBeUndefined();
});

test('stock it cannot count is unknown, never guessed; a deleted size is not offered', async () => {
  expect((await capture({ window: productData({ config: null }) })).variants).toEqual(offered(VARIANTS, [null, null, null]));
  expect((await capture({ window: productData({ config: { stockLocationIds: [] } }) })).variants).toEqual(offered(VARIANTS, [null, null, null]));
  const noStocks = [VARIANTS[0], { ...VARIANTS[1], stocks: undefined }, { ...VARIANTS[2], stocks: [{ stockLocationId: OTHER, stockCount: 5 }] }];
  expect((await capture({ window: productData({ variants: noStocks }) })).variants).toEqual(offered(noStocks, [true, null, null]));
  const deleted = [VARIANTS[0], { ...VARIANTS[1], deleted: true }, VARIANTS[2]];
  expect((await capture({ window: productData({ variants: deleted }) })).variants).toEqual(offered([VARIANTS[0], VARIANTS[2]]));
});

test('one size is not a choice, and Aymarka\'s Next data is left alone', async () => {
  const single = await capture({ window: productData({ variants: [VARIANTS[0]] }) });
  expect(single.variantStatus).toBeUndefined();
  // Window data of an Aymarka page (no IKAS page data): no picker from this branch.
  const aymarka = { page: '/urun/[slug]', props: { pageProps: { data: { response: { product: { id: 7, routePath: 'elbise', barcodes: [] } } } } } };
  expect((await capture({ path: '/urun/elbise', window: aymarka })).variantStatus).toBeUndefined();
});
