import { expect, test } from 'bun:test';
import { extractProductHtml } from './extract-product-price';
import { newinshopValidUntilReadings } from './newinshop-valid-until';
import { readSchemaProductOffer } from './schema-product-offer';

// newinshop.co pages (saved 2026-09-09 and 2026-09-21): the JSON-LD description
// carries raw line breaks, so only the mended block reads, and every offer says
// priceValidUntil "10/04/2040". Test data below is built in that shape.
const URL_ = 'https://www.newinshop.co/baliksirti-desenli-yelek';
const BREAK = String.fromCharCode(10);
const at = (iso: string) => new Date(iso);
type Options = { url?: string; offerUrl?: string; canonical?: string; offer?: string; price?: string; currency?: string };
const offerJson = (validUntil: string, o: Options = {}) =>
  `{"@type":"Offer","priceCurrency":"${o.currency ?? 'TRY'}","price":"${o.price ?? '5250.00 '}","priceValidUntil":"${validUntil}",` +
  `"url":"${o.offerUrl ?? o.url ?? URL_}","itemCondition":"http://schema.org/NewCondition","availability":"http://schema.org/InStock"${o.offer ?? ''}}`;
const product = (offers: string) => [
  '{"@context":"http://schema.org/","@type":"Product","name":"Balıksırtı Desenli Yelek",',
  `"description":">%64 Pes${BREAK}${BREAK}>Astarlı","mpn":"BaliksirtiDesenliYelek","productID":"1000000099","offers":${offers}}`,
].join('');
// The product form carries the product id and no size, as on a standard-size page;
// without it the chain states no stock (newinshop-size-stock.ts).
const html = (body: string, o: Options = {}) => {
  const url = o.canonical ?? o.url ?? URL_;
  return [
    `<html><head><link href="${url}" rel="canonical" /><meta property="og:url" content="${url}" />`,
    `<script type="application/ld+json">${body}</script></head><body>`,
    '<div class="uk-grid product-info"><input type="hidden" name="product_id" size="2" value="1000000099" /></div></body></html>',
  ].join('');
};
const page = (validUntil: string, o: Options = {}) => html(product(offerJson(validUntil, o)), o);
const read = (source: string, when: string, url = URL_) => readSchemaProductOffer(source, url, at(when));
const current = { status: 'success', priceMinor: 525000, currency: 'TRY', availability: 'in_stock', source: 'json-ld' } as const;
const expired = { status: 'rejected', reason: 'offer_outside_validity' } as const;

test('the two readings come from a strict DD/DD/YYYY value on newinshop only', () => {
  const home = new URL(URL_);
  expect(newinshopValidUntilReadings(home, '10/04/2040')).toEqual(['2040-04-10', '2040-10-04']);
  expect(newinshopValidUntilReadings(new URL('https://newinshop.co/x'), '10/04/2040')).toEqual(['2040-04-10', '2040-10-04']);
  expect(newinshopValidUntilReadings(home, '2040-04-10')).toBeNull();
  expect(newinshopValidUntilReadings(home, 20400410)).toBeNull();
  expect(newinshopValidUntilReadings(new URL('https://www.example.com/x'), '10/04/2040')).toBeNull();
});

test('both readings still ahead: the offer is current', () => {
  expect(read(page('10/04/2040'), '2026-09-25T12:00:00Z')).toEqual(current);
  // A value that reads the same both ways, and one where both readings are real.
  expect(read(page('05/05/2040'), '2040-05-05T12:00:00Z')).toEqual(current);
  expect(read(page('02/03/2040'), '2026-09-25T12:00:00Z')).toEqual(current);
});

test('one reading passed: rejected, whichever reading it is', () => {
  // 10/04/2040 is 10 April or 4 October: between them one reading has passed.
  expect(read(page('10/04/2040'), '2040-06-01T12:00:00Z')).toEqual(expired);
  // 04/10/2040 is 4 October or 10 April: the same window with the readings swapped.
  expect(read(page('04/10/2040'), '2040-06-01T12:00:00Z')).toEqual(expired);
  expect(read(page('10/04/2040'), '2040-10-04T12:00:00Z')).toEqual(expired);
});

test('both readings passed: rejected', () => {
  expect(read(page('10/04/2026'), '2026-11-01T12:00:00Z')).toEqual(expired);
  expect(read(page('05/05/2040'), '2040-05-06T00:00:00Z')).toEqual(expired);
});

test('the earlier reading is still valid on its own day and not the day after', () => {
  // The day-inclusive rule of every other date: a date is current through its day.
  expect(read(page('10/04/2040'), '2040-04-10T00:00:00Z')).toEqual(current);
  expect(read(page('10/04/2040'), '2040-04-10T23:59:59Z')).toEqual(current);
  expect(read(page('10/04/2040'), '2040-04-11T00:00:00Z')).toEqual(expired);
});

test.each([
  // A day above 12 leaves the other reading without a month. No reading is chosen,
  // so even a real leap day is rejected, as is one that does not exist.
  ['a real leap day', '29/02/2028'],
  ['a leap day that does not exist', '29/02/2027'],
  ['the 31st of February', '31/02/2040'],
  ['day zero', '00/04/2040'],
  ['month zero', '10/00/2040'],
  ['a thirteenth month one way', '10/13/2040'],
  ['a thirteenth month both ways', '13/13/2040'],
])('a reading that is not a calendar date rejects the offer: %s', (_name, value) => {
  expect(read(page(value), '2026-09-25T12:00:00Z')).toEqual(expired);
});

test.each([
  ['a trailing space', '10/04/2040 '],
  ['a leading space', ' 10/04/2040'],
  ['a single-digit month', '10/4/2040'],
  ['a single-digit day', '1/04/2040'],
  ['a two-digit year', '10/04/40'],
  ['dashes', '10-04-2040'],
  ['dots', '10.04.2040'],
  ['a time after the date', '10/04/2040T00:00:00Z'],
  ['the year first', '2040/04/10'],
  ['a trailing slash', '10/04/2040/'],
])('anything but the exact DD/DD/YYYY shape stays unreadable: %s', (_name, value) => {
  expect(read(page(value), '2026-09-25T12:00:00Z')).toEqual(expired);
});

test.each([
  ['another store', 'https://www.example.com/baliksirti-desenli-yelek'],
  ['plain http', 'http://www.newinshop.co/baliksirti-desenli-yelek'],
  ['a port', 'https://www.newinshop.co:8443/baliksirti-desenli-yelek'],
  ['user info', 'https://user:secret@www.newinshop.co/baliksirti-desenli-yelek'],
  ['a subdomain', 'https://shop.newinshop.co/baliksirti-desenli-yelek'],
  ['a look-alike host', 'https://www.newinshop.co.example.com/baliksirti-desenli-yelek'],
])('the slashed date is read only on newinshop.co itself: %s', (_name, url) => {
  // The same page shape on another address keeps the plain ISO rule.
  expect(read(page('10/04/2040', { url }), '2026-09-25T12:00:00Z', url)).toEqual(expired);
  expect(read(page('2040-04-10', { url }), '2026-09-25T12:00:00Z', url)).toEqual(current);
});

test('the store without www is the same store', () => {
  const url = 'https://newinshop.co/baliksirti-desenli-yelek';
  expect(read(page('10/04/2040', { url }), '2026-09-25T12:00:00Z', url)).toEqual(current);
});

test('other date fields keep the ISO rule on newinshop', () => {
  const extra = (field: string, value: string) => page('2040-04-10', { offer: `,"${field}":"${value}"` });
  expect(read(extra('validThrough', '10/04/2040'), '2026-09-25T12:00:00Z')).toEqual(expired);
  // Both readings of 10/04/2020 are in the past, which a start date would allow:
  // still unreadable as a start date.
  expect(read(extra('validFrom', '10/04/2020'), '2026-09-25T12:00:00Z')).toEqual(expired);
  expect(read(extra('validFrom', '2020-04-10'), '2026-09-25T12:00:00Z')).toEqual(current);
});

test('an ISO date behaves on newinshop as it does everywhere', () => {
  expect(read(page('2040-04-10'), '2026-09-25T12:00:00Z')).toEqual(current);
  expect(read(page('2026-09-25'), '2026-09-25T23:59:59Z')).toEqual(current);
  expect(read(page('2026-09-24'), '2026-09-25T00:00:00Z')).toEqual(expired);
  expect(read(page('2040-02-30'), '2026-09-25T12:00:00Z')).toEqual(expired);
  expect(read(page('2028-02-29'), '2026-09-25T12:00:00Z')).toEqual(current);
  expect(read(page('2027-02-29'), '2026-09-25T12:00:00Z')).toEqual(expired);
});

test('a readable date never lets another rejection through', () => {
  const now = '2026-09-25T12:00:00Z';
  // The offer names another product of the same store.
  expect(read(page('10/04/2040', { offerUrl: 'https://www.newinshop.co/baska-urun' }), now))
    .toEqual({ status: 'rejected', reason: 'offer_identity_mismatch' });
  // The page says it is another product.
  expect(read(page('10/04/2040', { canonical: 'https://www.newinshop.co/baska-urun' }), now))
    .toEqual({ status: 'rejected', reason: 'product_identity_unproven' });
  expect(read(page('10/04/2040', { offer: ',"eligibleQuantity":{"minValue":2}' }), now))
    .toEqual({ status: 'rejected', reason: 'conditional_offer' });
  expect(read(page('10/04/2040', { price: '0.00' }), now)).toEqual({ status: 'rejected', reason: 'invalid_price' });
  expect(read(page('10/04/2040', { price: '5.250,00' }), now)).toEqual({ status: 'rejected', reason: 'invalid_price' });
  expect(read(page('10/04/2040', { currency: 'JPY' }), now)).toEqual({ status: 'rejected', reason: 'unsupported_currency' });
  expect(read(html(product(`[${offerJson('10/04/2040')},${offerJson('10/04/2040')}]`)), now))
    .toEqual({ status: 'rejected', reason: 'ambiguous_offer' });
});

test('stock rules are unchanged around the date', () => {
  const now = '2026-09-25T12:00:00Z';
  // A saved size never takes the product's stock.
  const sized = `${URL_}?variant=1`;
  expect(read(page('10/04/2040'), now, sized)).toEqual({ ...current, availability: 'unknown' });
  // Sizes in and out of stock at one price: price read, stock unknown; every
  // size's own date still has to hold.
  const size = (availability: string, validUntil: string) =>
    `{"@type":"Product","sku":"${availability}","offers":${offerJson(validUntil).replace('InStock', availability)}}`;
  const group = (...sizes: string[]) => html(`{"@context":"https://schema.org","@type":"ProductGroup","url":"${URL_}",` +
    `"description":"a${BREAK}b","hasVariant":[${sizes.join(',')}]}`);
  expect(read(group(size('InStock', '10/04/2040'), size('OutOfStock', '10/04/2040')), now)).toEqual({ ...current, availability: 'unknown' });
  expect(read(group(size('InStock', '10/04/2040'), size('OutOfStock', '10/04/2040')), '2040-06-01T12:00:00Z')).toEqual(expired);
});

test('the chain reads the page through the same rule', () => {
  // extractProductHtml uses the time of the call; 10/04/2040 is ahead either way.
  expect(extractProductHtml(page('10/04/2040'), URL_)).toEqual(current);
  expect(extractProductHtml(page('10/04/2020'), URL_))
    .toEqual({ status: 'not_found', error: 'Schema offer cannot be used: offer_outside_validity' });
  const other = 'https://www.example.com/baliksirti-desenli-yelek';
  expect(extractProductHtml(page('10/04/2040', { url: other }), other))
    .toEqual({ status: 'not_found', error: 'Schema offer cannot be used: offer_outside_validity' });
});
