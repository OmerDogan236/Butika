import { afterEach, expect, test } from 'bun:test';
import { extractProductHtml } from './extract-product-price';
import { jimmykeyChoice } from './jimmykey-size-stock';
import { resolveProductPrice } from './price-source-router';
import { JIMMYKEY_SIZES, JIMMYKEY_SOLD_OUT_PRODUCT as PRODUCT, JIMMYKEY_SOLD_OUT_SIZES as SIZES, JIMMYKEY_SOLD_OUT_URL as URL_, JIMMYKEY_URL,
  jimmykeyElsewhere as elsewhere, jimmykeyFavourite as favourite, jimmykeyNotifyLink as notifyLink, jimmykeyPage, jimmykeySizeList as list,
  jimmykeySoldOut as soldOut, jimmykeySoldOutPage as page, selectedUrl, type JimmykeyPage as Page } from './jimmykey.fixture';

// A colour sold out in every size has no add-to-bag button: the notify-me link a#NotAdd
// stands in its place, and the block's favourite button carries the product code and amount
// (jimmykey-size-stock.ts). The first test reads the white/518 page's markup (fetched
// 2026-09-27, trimmed into the fixture); every other link, button, size and identity below is
// made up from it. The fetched body itself is read by the offline check outside this
// repository, before and after this rule.
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const chosen = (sizeId: string) => selectedUrl(sizeId, { productId: PRODUCT.id, colourId: '518', page: URL_ });
const read = (o: Page = {}) => extractProductHtml(page(o), URL_);
const unknown = { status: 'success', priceMinor: 169995, currency: 'TRY', availability: 'unknown', source: 'json-ld' } as const;
const size = (availability: 'in_stock' | 'out_of_stock') =>
  ({ status: 'success', priceMinor: 169995, currency: 'TRY', availability, source: 'jimmykey' }) as const;
const rejected = (reason: string) => ({ status: 'not_found', error: `Selected jimmykey size cannot be verified: ${reason}` }) as const;
const conflict = (reason: string) => ({
  page: { status: 'not_found', contradiction: true, error: `jimmykey page does not match the requested product: ${reason}` },
  size: { ...rejected(`page does not match the requested product: ${reason}`), contradiction: true },
}) as const;
const unbound = (reason: string) => ({ page: unknown, size: rejected(`product block: ${reason}`) }) as const;
// This page's own favourite button, as the fixture renders it.
const own = { id: PRODUCT.id, code: PRODUCT.code, amount: '1699.95' };

test('the page as fetched: every size sold out on its own, each read at the page\'s price', () => {
  expect(jimmykeyChoice(page(), URL_)).toEqual({ kind: 'bound', amountMinor: 169995, productId: PRODUCT.id, unclear: null,
    sizes: SIZES.map(({ id, label }) => ({ id, label, onSale: false })) });
  for (const entry of SIZES) expect(extractProductHtml(page(), chosen(entry.id))).toEqual(size('out_of_stock'));
  // The page says InStock for the product: every size sold out contradicts it, so no product-level stock.
  expect(read()).toEqual(unknown);
});

test('the full resolver reads a chosen size from the page alone', async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    requested.push(href);
    if (href === URL_) return new Response(page(), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    throw new Error(`Unexpected request: ${href}`);
  }) as typeof fetch;
  const result = await resolveProductPrice({ url: chosen('87') });
  expect(result).toMatchObject({ status: 'success', observation: { priceMinor: 169995, currency: 'TRY', availability: 'out_of_stock', provider: 'structured_html' } });
  expect(result.attempts.map(a => `${a.provider}:${a.status}`)).toEqual(['structured_html:success']);
  expect(requested).toEqual([URL_]);
});

test.each([
  ['a link naming another product', { notify: { productId: '99999' } }, conflict('product id')],
  ['a link naming another colour', { notify: { colourId: '83' } }, conflict('colour')],
  ['a favourite button of another product id', { favourite: { id: '99999' } }, conflict('product id')],
  ['a favourite button with another product code', { favourite: { code: '6SW999999' } }, conflict('favourite product code')],
  ['a second favourite button with another product code', { inBlock: favourite({ ...own, code: '6SW999999' }) }, conflict('favourite product code')],
  ['no favourite button', { favourite: null }, unbound('favourite button')],
  ['a favourite button without its product id', { favourite: { id: null } }, unbound('favourite button')],
  ['a favourite that is not a button', { favourite: { tag: 'div' } }, unbound('favourite button')],
  ['two favourite buttons', { inBlock: favourite(own) }, unbound('favourite button')],
  ['a favourite button without an amount', { favourite: { amount: null } }, unbound('favourite amount')],
  ['two notify-me links', { inBlock: notifyLink({ productId: PRODUCT.id, colourId: '518' }) }, unbound('notify-me link')],
  ['a link without its RemindMe class', { notify: { className: 'CartButtonColor' } }, unbound('notify-me link')],
  ['a link without its product id', { notify: { productId: null } }, unbound('notify-me link')],
  ['a link without its colour id', { notify: { colourId: null } }, unbound('notify-me link')],
  ['a link outside the product block', { notify: null, tail: notifyLink({ productId: PRODUCT.id, colourId: '518' }) }, unbound('a notify-me link outside the product block')],
  ['an add-to-bag button beside the link', { basket: true }, unbound('add-to-bag button beside a notify-me link')],
  // A button of its own is never replaced by the link: its failures stay its own.
  ['an add-to-bag button without its code beside the link', { basket: true, basketCode: null }, unbound('add-to-bag button')],
  ['an add-to-bag button of another product beside the link', { basket: true, basketCode: '6SW999999' }, conflict('add-to-bag product code')],
  ['neither a button nor a link', { notify: null }, unbound('add-to-bag button')],
])('%s: no size is read', (_, o: Page, expected) => {
  expect(read(o)).toEqual(expected.page);
  expect(extractProductHtml(page(o), chosen('87'))).toEqual(expected.size);
});

test('a size on sale beside the link, or an unclear list, gives no size a reading from the link', () => {
  // Made up: 36 on sale while the page shows only the notify-me link.
  const mixed = { sizes: SIZES.map(entry => ({ ...entry, onSale: entry.id === '87' })) };
  expect(read(mixed)).toEqual(unknown);
  for (const entry of SIZES) expect(extractProductHtml(page(mixed), chosen(entry.id))).toEqual(rejected('product block: a size on sale beside the notify-me link'));
  // Made up: 42 without its "Notify Me" link. The link never marks a size sold out by itself.
  const unclear = { sizeList: list(SIZES.slice(0, 4), soldOut(SIZES[4]!).replace('class=NotifyWhen', 'class=Other')) };
  expect(read(unclear)).toEqual(unknown);
  expect(extractProductHtml(page(unclear), chosen('87'))).toEqual(rejected('size list: a sold-out size without its id, label or sold-out marks'));
});

test('the favourite amount must be the page\'s price', () => {
  expect(read({ favourite: { amount: '2999.95' } })).toEqual({ status: 'not_found', contradiction: true, error: 'jimmykey add-to-bag amount differs from the product price' });
  expect(extractProductHtml(page({ favourite: { amount: '2999.95' } }), chosen('87')))
    .toEqual({ ...rejected('add-to-bag amount differs from the product price'), contradiction: true });
});

test('links and favourites in recommendations, modals and templates are not the page\'s', () => {
  const foreign = [notifyLink({ productId: '99999', colourId: '99' }), favourite({ id: '99999', code: '6SW999999' })].join('');
  for (const tail of elsewhere(foreign)) {
    expect(read({ tail })).toEqual(unknown);
    expect(extractProductHtml(page({ tail }), chosen('87'))).toEqual(size('out_of_stock'));
  }
});

test('a page with an add-to-bag button reads as before: its favourite button plays no part', () => {
  const s = JIMMYKEY_SIZES.find(entry => entry.onSale)!;
  const before = extractProductHtml(jimmykeyPage(), selectedUrl(s.id));
  expect(before).toMatchObject({ status: 'success', availability: 'in_stock' });
  for (const o of [{ favourite: null }, { favourite: { code: '6SW999999' } }, { favourite: { id: '99999' } }, { favourite: { amount: '1.00' } }] as Page[]) {
    expect(extractProductHtml(jimmykeyPage(o), selectedUrl(s.id))).toEqual(before);
    expect(extractProductHtml(jimmykeyPage(o), JIMMYKEY_URL)).toEqual(extractProductHtml(jimmykeyPage(), JIMMYKEY_URL));
  }
});
