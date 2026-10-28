import { expect, test } from 'bun:test';
import { extractProductHtml } from './extract-product-price';
import { readSchemaProductOffer } from './schema-product-offer';

// Shapes trimmed from saved store pages (2026-09-21 scan samples).
const now = new Date('2026-09-21T12:00:00Z');
type Node = Record<string, unknown>;
const page = (nodes: unknown[], canonical?: string, extra = '') =>
  `<html><head>${canonical ? `<link rel="canonical" href="${canonical}">` : ''}${nodes
    .map(node => `<script type="application/ld+json">${JSON.stringify(node)}</script>`).join('')}${extra}</head><body></body></html>`;
const offer = (price: unknown, availability: string, extra: Node = {}): Node =>
  ({ '@type': 'Offer', price, priceCurrency: 'TRY', availability: `https://schema.org/${availability}`, ...extra });
const variant = (sku: string, ...offers: Node[]): Node =>
  ({ '@type': 'Product', sku, offers: offers.length === 1 ? offers[0] : offers });
const group = (url: string | undefined, variants: Node[], extra: Node = {}): Node =>
  ({ '@context': 'https://schema.org', '@type': 'ProductGroup', ...(url ? { url } : {}), hasVariant: variants, ...extra });

const gencallar = 'https://www.gencallar.com.tr/bebek-body-ve-zibin/s26b4bd701-body-P59434';
const modamizbir = 'https://www.modamizbir.com/bej-jessica-kumas-bluz-176699';
const donne = 'https://donne.com.tr/urun/britney/';
const tesettur = 'https://tesetturisland.com/cicek-nakisli-elbise-60103ant';
const gebe = 'https://gebematernity.com/product/cardigan-valeri/';

test('a group with one uniform variant price gives that price and the shared stock', () => {
  // gencallar: group url, a group-level Offer and a single variant.
  const inStock = offer(656.99, 'InStock', { url: gencallar, sku: '11760387001' });
  const html = page([group(gencallar, [variant('11760387001', inStock)], { offers: inStock })], gencallar);
  expect(readSchemaProductOffer(html, gencallar, now)).toEqual({ status: 'success', priceMinor: 65699, currency: 'TRY', availability: 'in_stock', source: 'json-ld' });
});

test('a group without url or @id is this page only through its single canonical link', () => {
  // modamizbir: sizes S/M/L, all sold out, identity only from the canonical link.
  const sizes = ['S', 'M', 'L'].map((size, i) => variant(`60877${i}`, offer(131.99, 'OutOfStock', { url: modamizbir })));
  const expected = { status: 'success', priceMinor: 13199, currency: 'TRY', availability: 'out_of_stock', source: 'json-ld' } as const;
  expect(readSchemaProductOffer(page([group(undefined, sizes)], modamizbir), modamizbir, now)).toEqual(expected);
  expect(readSchemaProductOffer(page([group(undefined, sizes)]), modamizbir, now)).toEqual({ status: 'absent' });
  expect(readSchemaProductOffer(page([group(undefined, sizes)], 'https://www.modamizbir.com/'), modamizbir, now)).toEqual({ status: 'absent' });
  expect(readSchemaProductOffer(page([group(undefined, sizes)], modamizbir, `<link rel="canonical" href="${modamizbir}">`), modamizbir, now)).toEqual({ status: 'absent' });
});

test('variants that name other pages are not read as this page, even at one price', () => {
  // penti: each colour is a page of its own; offers carry no url. Sibling pages
  // need their own membership proof before they can count.
  const url = 'https://www.penti.com/en/shaping/shaper-black-shorts/p/PCDP655C24IY-500';
  const colours = [variant('PCDP655C24IY-500', offer('599.99', 'InStock')), variant('PCDP655C24IY-57Y', offer('599.99', 'InStock'))]
    .map((node, i) => ({ ...node, url: `/shaping/shaper-${i ? 'nude' : 'black'}-shorts/p/${node.sku}` }));
  expect(readSchemaProductOffer(page([group(undefined, colours)], url), url, now)).toEqual({ status: 'rejected', reason: 'variant_identity_mismatch' });
});

// Codex review 2026-09-21 (schema-offer-review-repro.ts): the control case and the
// two shapes that were wrongly accepted.
test('a variant of another product page or an expired direct offer is rejected', () => {
  const url = 'https://shop.example/urun/a';
  const base = (variantExtra: Node = {}, offerExtra: Node = {}) => ({ '@type': 'ProductGroup', url, hasVariant: [{ '@type': 'Product', url,
    offers: { '@type': 'Offer', price: '100', priceCurrency: 'TRY', availability: 'InStock', ...offerExtra }, ...variantExtra }] });
  const read = (node: Node) => readSchemaProductOffer(`<script type="application/ld+json">${JSON.stringify(node)}</script>`, url, now);
  expect(read(base())).toEqual({ status: 'success', priceMinor: 10000, currency: 'TRY', availability: 'in_stock', source: 'json-ld' });
  expect(read(base({ url: 'https://shop.example/urun/b' }))).toEqual({ status: 'rejected', reason: 'variant_identity_mismatch' });
  expect(read(base({}, { priceValidUntil: '2020-01-01' }))).toEqual({ status: 'rejected', reason: 'offer_outside_validity' });
});

test('direct offers follow the same date and condition rules as unit prices', () => {
  const read = (offerExtra: Node, groupOffers?: Node) =>
    readSchemaProductOffer(page([group(donne, [variant('A', offer('100', 'InStock', { url: donne, ...offerExtra }))],
      groupOffers ? { offers: groupOffers } : {})], donne), donne, now);
  expect(read({ priceValidUntil: '2026-09-21', validFrom: '2026-09-21', validThrough: '2026-09-21' })).toMatchObject({ status: 'success', priceMinor: 10000 });
  for (const late of [{ validFrom: '2026-09-22' }, { validThrough: '2026-09-20' }, { priceValidUntil: '2026-09-20' },
    { priceValidUntil: '2026-12-31T23:59:59+03:00' }, { priceValidUntil: '2026-02-30' }]) {
    expect(read(late)).toEqual({ status: 'rejected', reason: 'offer_outside_validity' });
  }
  for (const condition of [{ eligibleQuantity: { minValue: 2 } }, { eligibleCustomerType: 'Business' }, { businessFunction: 'LeaseOut' }]) {
    expect(read(condition)).toEqual({ status: 'rejected', reason: 'conditional_offer' });
  }
  const summary = { '@type': 'AggregateOffer', lowPrice: 100, highPrice: 100, priceCurrency: 'TRY', offerCount: 1 };
  expect(read({}, summary)).toMatchObject({ status: 'success' });
  expect(read({}, { ...summary, priceValidUntil: '2020-01-01' })).toEqual({ status: 'rejected', reason: 'offer_outside_validity' });
  expect(read({}, offer('100', 'InStock', { eligibleQuantity: { minValue: 3 } }))).toEqual({ status: 'rejected', reason: 'conditional_offer' });
});

test('a same-site root @id names a schema graph node, not another page', () => {
  // miskanber (Shopify with a schema app): variant @id "https://shop/#/schema/Product/<id>",
  // offer priced only by a tax-inclusive UnitPriceSpecification; og:price matches.
  const url = 'https://www.miskanber.com/products/oud-paradisio-absolu-edp-100ml';
  const shape = (variantId: string) => group(url, [{ '@type': 'Product', '@id': variantId, sku: 'P-0000003675',
    offers: { '@type': 'Offer', '@id': 'https://www.miskanber.com/#/schema/Offer/52024495702301', availability: 'https://schema.org/InStock', url,
      priceSpecification: [{ '@type': 'UnitPriceSpecification', valueAddedTaxIncluded: true, price: 21690.0, priceCurrency: 'TRY' }] } }],
    { '@id': `${url}/#/schema/Product` });
  const html = (variantId: string) => page([shape(variantId)], url, meta('21690.0'));
  expect(readSchemaProductOffer(html('https://www.miskanber.com/#/schema/Product/52024495702301'), url, now))
    .toEqual({ status: 'success', priceMinor: 2169000, currency: 'TRY', availability: 'in_stock', source: 'unit-price-specification' });
  expect(readSchemaProductOffer(html('https://other-shop.example/#/schema/Product/1'), url, now)).toEqual({ status: 'rejected', reason: 'variant_identity_mismatch' });
  expect(readSchemaProductOffer(html('https://www.miskanber.com/products/other#variant'), url, now)).toEqual({ status: 'rejected', reason: 'variant_identity_mismatch' });
});

test.each([
  'https://donne.com.tr/', 'https://donne.com.tr/#home',
  'https://donne.com.tr/?product=other#/schema/Product/1',
  'https://other.example/#/schema/Product/1',
  'https://donne.com.tr:8443/#/schema/Product/1',
  'http://donne.com.tr/#/schema/Product/1', 'https://user@donne.com.tr/#/schema/Product/1',
])('root id exception does not ignore another page claim: %s', id => {
  const v = { ...variant('A', offer('100', 'InStock')), '@id': id };
  expect(readSchemaProductOffer(page([group(donne, [v])], donne), donne, now))
    .toEqual({ status: 'rejected', reason: 'variant_identity_mismatch' });
});

test('a variant @id on this page, or an empty identity, still belongs to the group', () => {
  const variants = [
    { ...variant('A', offer('100', 'InStock')), '@id': `${donne}?attribute_pa_beden=s#variant` },
    { ...variant('B', offer('100', 'InStock', { url: null })), url: null },
    { ...variant('C', offer('100', 'InStock')), '@id': 'variant-c' },
  ];
  expect(readSchemaProductOffer(page([group(donne, variants)], donne), donne, now)).toMatchObject({ status: 'success', priceMinor: 10000, availability: 'in_stock' });
  const elsewhere = [{ ...variant('A', offer('100', 'InStock')), '@id': 'https://donne.com.tr/urun/other/#variant' }];
  expect(readSchemaProductOffer(page([group(donne, elsewhere)], donne), donne, now)).toEqual({ status: 'rejected', reason: 'variant_identity_mismatch' });
});

test('an aggregate summary must agree with the listed variants', () => {
  // myrentaldress: USD, @id with a fragment, AggregateOffer over two colours.
  const url = 'https://www.myrentaldress.com/ar-sa/products/custom/berta/10504';
  const colours = ['beige', 'navy'].map(colour => variant(`10504-${colour}`, { ...offer(1500, 'InStock', { url: `${url}?color=${colour}` }), priceCurrency: 'USD' }));
  const summary = (extra: Node) => group(undefined, colours, { '@id': `${url}#product`, offers: { '@type': 'AggregateOffer', lowPrice: 1500, highPrice: 1500, priceCurrency: 'USD', offerCount: 2, ...extra } });
  expect(readSchemaProductOffer(page([summary({})], url), url, now)).toEqual({ status: 'success', priceMinor: 150000, currency: 'USD', availability: 'in_stock', source: 'json-ld' });
  for (const conflict of [{ offerCount: 3 }, { lowPrice: 1200 }, { priceCurrency: 'EUR' }]) {
    expect(readSchemaProductOffer(page([summary(conflict)], url), url, now)).toEqual({ status: 'rejected', reason: 'conflicting_group_offer' });
  }
});

test('a relative @id identifies the page and a saved size never inherits group stock', () => {
  // ihvan: Shopify group with one variant; group and variant carry relative @ids.
  const url = 'https://ihvanonline.com/products/10-pack-kufi-hat';
  const only = { ...variant('pc_3003013023030', { ...offer('19.90', 'InStock', { url: `${url}?variant=45114330153211` }), priceCurrency: 'USD' }),
    '@id': '/products/10-pack-kufi-hat?variant=45114330153211#variant' };
  const node = group(url, [only], { '@id': '/products/10-pack-kufi-hat#product' });
  expect(readSchemaProductOffer(page([node], url), url, now)).toMatchObject({ status: 'success', priceMinor: 1990, currency: 'USD', availability: 'in_stock' });
  expect(readSchemaProductOffer(page([node], url), `${url}?variant=45114330153211`, now)).toMatchObject({ status: 'success', priceMinor: 1990, availability: 'unknown' });
});

test('offer links with escaped query strings still belong to the product', () => {
  // donne: six size/colour variants without SKU, offer urls carry "&amp;".
  const variants = ['s', 'm', 'l'].flatMap(size => ['somon', 'bebek-mavisi'].map(colour =>
    ({ '@type': 'Product', offers: offer('550', 'OutOfStock', { url: `${donne}?attribute_pa_beden=${size}&amp;attribute_pa_renk=${colour}` }) })));
  expect(readSchemaProductOffer(page([group(donne, variants, { '@id': `${donne}#richSnippet` })], donne), donne, now))
    .toEqual({ status: 'success', priceMinor: 55000, currency: 'TRY', availability: 'out_of_stock', source: 'json-ld' });
});

test('mixed stock is unknown and mixed prices are rejected instead of choosing one', () => {
  // tesetturisland: four sizes at one price, two of them sold out.
  const sizes = (prices: string[]) => prices.map((price, i) =>
    variant(`ALA-60103|${38 + 2 * i}`, offer(price, i % 2 ? 'InStock' : 'OutOfStock', { url: `${tesettur}?variant=27085${8 + i}` })));
  const html = (prices: string[]) => page([group(tesettur, sizes(prices), { '@id': `${tesettur}#productgroup` })], tesettur);
  expect(readSchemaProductOffer(html(['3076.59', '3076.59', '3076.59', '3076.59']), tesettur, now)).toMatchObject({ status: 'success', priceMinor: 307659, availability: 'unknown' });
  expect(readSchemaProductOffer(html(['3076.59', '2999.00', '3076.59', '3076.59']), tesettur, now)).toEqual({ status: 'rejected', reason: 'mixed_variant_prices' });
});

test('a group-level offer that disagrees on stock leaves stock unknown', () => {
  const variants = [variant('A', offer('100', 'InStock', { url: donne })), variant('B', offer('100', 'InStock', { url: donne }))];
  expect(readSchemaProductOffer(page([group(donne, variants, { offers: offer('100', 'OutOfStock') })], donne), donne, now))
    .toMatchObject({ status: 'success', priceMinor: 10000, availability: 'unknown' });
});

test.each([
  ['price null', [variant('A', offer(null, 'InStock')), variant('B', offer('100', 'InStock'))], 'invalid_price'],
  ['zero price', [variant('A', offer('0', 'InStock'))], 'invalid_price'],
  ['comma decimal', [variant('A', offer('1.299,99', 'InStock'))], 'invalid_price'],
  ['two offers for one variant', [variant('A', offer('100', 'InStock'), offer('90', 'InStock'))], 'ambiguous_variant_offer'],
  ['an offer of another product', [variant('A', offer('100', 'InStock', { url: 'https://donne.com.tr/urun/other/' }))], 'offer_identity_mismatch'],
  ['an aggregate variant offer', [variant('A', { '@type': 'AggregateOffer', lowPrice: 90, highPrice: 100, priceCurrency: 'TRY' })], 'unsupported_offer'],
  ['mixed currencies', [variant('A', offer('100', 'InStock')), variant('B', { ...offer('100', 'InStock'), priceCurrency: 'USD' })], 'mixed_currencies'],
  ['a zero-decimal currency', [variant('A', { ...offer('100', 'InStock'), priceCurrency: 'JPY' })], 'unsupported_currency'],
  ['a non-product variant', [{ '@type': 'Offer', price: '100' }], 'unsupported_variant'],
  ['no variants', [], 'unsupported_variant_list'],
] as const)('an unusable own group is rejected: %s', (_name, variants, reason) => {
  expect(readSchemaProductOffer(page([group(donne, [...variants])], donne), donne, now)).toEqual({ status: 'rejected', reason });
});

test('two own groups, or an own group next to an own product, are ambiguous', () => {
  const own = group(donne, [variant('A', offer('100', 'InStock'))]);
  expect(readSchemaProductOffer(page([own, own], donne), donne, now)).toEqual({ status: 'rejected', reason: 'ambiguous_product' });
  expect(readSchemaProductOffer(page([own, { '@type': 'Product', url: donne, offers: offer('100', 'InStock', { price: undefined }) }], donne), donne, now))
    .toEqual({ status: 'rejected', reason: 'ambiguous_product' });
});

const unitOffer = (extra: Node = {}) => ({ '@type': 'Offer', availability: 'https://schema.org/OutOfStock', url: gebe,
  priceSpecification: [{ '@type': 'UnitPriceSpecification', price: '356.85', priceCurrency: 'TRY', valueAddedTaxIncluded: true, validThrough: '2027-12-31', ...extra }] });
const gebeProduct = (offers: unknown, url = gebe) => ({ '@context': 'https://schema.org/', '@type': 'Product', url, '@id': `${url}#product`, sku: 'G7113202', offers });

test('a single tax-inclusive unit price gives price and stock from the same offer', () => {
  // gebe: no Offer.price, one UnitPriceSpecification with VAT included.
  expect(readSchemaProductOffer(page([gebeProduct(unitOffer())], gebe), gebe, now))
    .toEqual({ status: 'success', priceMinor: 35685, currency: 'TRY', availability: 'out_of_stock', source: 'unit-price-specification' });
  expect(readSchemaProductOffer(page([gebeProduct(unitOffer())], gebe), `${gebe}?variant=1`, now)).toMatchObject({ availability: 'unknown' });
});

test('an unproven unit price, product or offer is rejected', () => {
  // sumella: the specification says VAT is not included.
  expect(readSchemaProductOffer(page([gebeProduct(unitOffer({ valueAddedTaxIncluded: false }))], gebe), gebe, now))
    .toEqual({ status: 'rejected', reason: 'tax_inclusive_price_unproven' });
  expect(readSchemaProductOffer(page([gebeProduct([unitOffer(), unitOffer()])], gebe), gebe, now)).toEqual({ status: 'rejected', reason: 'ambiguous_offer' });
  expect(readSchemaProductOffer(page([gebeProduct(unitOffer(), 'https://gebematernity.com/product/other/')], gebe), gebe, now))
    .toEqual({ status: 'rejected', reason: 'product_identity_unproven' });
  expect(readSchemaProductOffer(page([gebeProduct(unitOffer()), gebeProduct(unitOffer())], gebe), gebe, now)).toEqual({ status: 'rejected', reason: 'ambiguous_product' });
});

test('pages without these shapes are left to the other readers', () => {
  expect(readSchemaProductOffer('<html></html>', gebe, now)).toEqual({ status: 'absent' });
  expect(readSchemaProductOffer(page([{ '@type': 'Product', url: gebe, offers: offer('100', 'InStock') }], gebe), gebe, now)).toEqual({ status: 'absent' });
  expect(readSchemaProductOffer(page([{ '@type': 'Product', url: gebe, offers: { '@type': 'Offer', availability: 'InStock' } }], gebe), gebe, now)).toEqual({ status: 'absent' });
});

test('the input data is not changed', () => {
  const node = group(donne, [variant('A', offer('100', 'InStock', { url: donne }))], { offers: offer('100', 'InStock') });
  const before = JSON.stringify(node);
  readSchemaProductOffer(page([node], donne), donne, now);
  expect(JSON.stringify(node)).toBe(before);
});

// In the extraction chain the schema offers only fill gaps: a price the older
// readers find still stands (the live check of 147 pages that read today found
// regressions when these offers took over), and they may add the stock they prove
// for exactly that price.
const meta = (amount: string) => `<meta property="product:price:amount" content="${amount}"><meta property="product:price:currency" content="TRY">`;

test('an own group answers only when no older reader finds a price', () => {
  const variants = [variant('A', offer('550', 'OutOfStock', { url: donne })), variant('B', offer('550', 'OutOfStock', { url: donne }))];
  expect(extractProductHtml(page([group(donne, variants)], donne), donne))
    .toEqual({ status: 'success', priceMinor: 55000, currency: 'TRY', availability: 'out_of_stock', source: 'json-ld' });
  expect(extractProductHtml(page([group(donne, variants)], donne, meta('499.00')), donne))
    .toEqual({ status: 'success', priceMinor: 49900, currency: 'TRY', availability: 'unknown', source: 'meta' });
});

test('an own group adds its proven stock to the same meta price only', () => {
  const variants = (state: string) => [variant('A', offer('550', state, { url: donne })), variant('B', offer('550', state, { url: donne }))];
  expect(extractProductHtml(page([group(donne, variants('InStock'))], donne, meta('550.00')), donne))
    .toEqual({ status: 'success', priceMinor: 55000, currency: 'TRY', availability: 'in_stock', source: 'meta' });
  expect(extractProductHtml(page([group(donne, variants('OutOfStock'))], donne, meta('550.00')), donne))
    .toEqual({ status: 'success', priceMinor: 55000, currency: 'TRY', availability: 'out_of_stock', source: 'meta' });
  // Mixed stock proves nothing, and a rounded display price is not the same amount.
  const mixed = [variant('A', offer('550', 'InStock', { url: donne })), variant('B', offer('550', 'OutOfStock', { url: donne }))];
  expect(extractProductHtml(page([group(donne, mixed)], donne, meta('550.00')), donne)).toMatchObject({ priceMinor: 55000, availability: 'unknown' });
  const precise = [variant('A', offer('3086.85', 'InStock', { url: donne }))];
  expect(extractProductHtml(page([group(donne, precise)], donne, meta('3087.00')), donne))
    .toEqual({ status: 'success', priceMinor: 308700, currency: 'TRY', availability: 'unknown', source: 'meta' });
});

test('an unusable own group never becomes a price and is reported only without one', () => {
  const mixed = [variant('A', offer('550', 'InStock', { url: donne })), variant('B', offer('600', 'InStock', { url: donne }))];
  expect(extractProductHtml(page([group(donne, mixed)], donne, meta('550.00')), donne))
    .toEqual({ status: 'success', priceMinor: 55000, currency: 'TRY', availability: 'unknown', source: 'meta' });
  expect(extractProductHtml(page([group(donne, mixed)], donne), donne))
    .toEqual({ status: 'not_found', error: 'Schema offer cannot be used: mixed_variant_prices' });
  const expired = [variant('A', offer('550', 'InStock', { url: donne, priceValidUntil: '2020-01-01' }))];
  expect(extractProductHtml(page([group(donne, expired)], donne, meta('550.00')), donne)).toMatchObject({ priceMinor: 55000, availability: 'unknown', source: 'meta' });
  expect(extractProductHtml(page([group(donne, expired)], donne), donne))
    .toEqual({ status: 'not_found', error: 'Schema offer cannot be used: offer_outside_validity' });
});

test('a group of another page and a direct Product offer keep their current readers', () => {
  const foreign = group('https://donne.com.tr/urun/other/', [variant('A', offer('600', 'InStock'))]);
  expect(extractProductHtml(page([foreign], donne, meta('550.00')), donne)).toMatchObject({ status: 'success', priceMinor: 55000, source: 'meta' });
  const direct = { '@type': 'Product', url: donne, offers: offer('450', 'InStock', { url: donne }) };
  expect(extractProductHtml(page([direct, group(donne, [variant('A', offer('550', 'InStock'))])], donne), donne))
    .toMatchObject({ status: 'success', priceMinor: 45000, source: 'json-ld' });
});

test('a unit-priced page is read in the chain with stock from the same offer', () => {
  const until = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  expect(extractProductHtml(page([gebeProduct(unitOffer({ validThrough: until }))], gebe), gebe))
    .toEqual({ status: 'success', priceMinor: 35685, currency: 'TRY', availability: 'out_of_stock', source: 'unit-price-specification' });
  expect(extractProductHtml(page([gebeProduct(unitOffer({ validThrough: until, valueAddedTaxIncluded: false }))], gebe), gebe))
    .toEqual({ status: 'not_found', error: 'Schema offer cannot be used: tax_inclusive_price_unproven' });
  // An unproven unit price adds no stock to the page's own meta price.
  expect(extractProductHtml(page([gebeProduct(unitOffer({ validThrough: until, valueAddedTaxIncluded: false }))], gebe, meta('356.85')), gebe))
    .toEqual({ status: 'success', priceMinor: 35685, currency: 'TRY', availability: 'unknown', source: 'meta' });
});

// A block that only parses after its raw line breaks are escaped is data we mended,
// so it carries no weight of its own: it is read here, under every check, or not at
// all (Codex review 2026-09-23).
const BREAK = String.fromCharCode(10);
const mended = (extra: string, url = donne) =>
  `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Elbise",` +
  `"description":"iki${BREAK}${BREAK}satır","url":"${url}",` +
  `"offers":{"@type":"Offer","priceCurrency":"TRY","price":"550.00","url":"${url}","availability":"https://schema.org/InStock"${extra}}}</script>`;
const mendedPage = (extra: string, tail = '', url = donne) =>
  `<html><head><link rel="canonical" href="${url}">${mended(extra, url)}${tail}</head><body></body></html>`;

test('a mended offer answers only when every check passes', () => {
  const past = '2020-01-01', future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  expect(extractProductHtml(mendedPage(''), donne))
    .toEqual({ status: 'success', priceMinor: 55000, currency: 'TRY', availability: 'in_stock', source: 'json-ld' });
  // atelierrebul: an offer whose price validity ran out is no price and no stock.
  expect(extractProductHtml(mendedPage(`,"priceValidUntil":"${past}"`), donne))
    .toEqual({ status: 'not_found', error: 'Schema offer cannot be used: offer_outside_validity' });
  // newinshop writes 10/04/2040. On any other store that is a date we cannot read,
  // and no proof of validity (newinshop's own pages: newinshop-valid-until.test.ts).
  expect(extractProductHtml(mendedPage(',"priceValidUntil":"10/04/2040"'), donne))
    .toMatchObject({ status: 'not_found', error: 'Schema offer cannot be used: offer_outside_validity' });
  expect(extractProductHtml(mendedPage(`,"validFrom":"${future}"`), donne))
    .toEqual({ status: 'not_found', error: 'Schema offer cannot be used: offer_outside_validity' });
  expect(extractProductHtml(mendedPage(',"eligibleQuantity":{"minValue":2}'), donne))
    .toEqual({ status: 'not_found', error: 'Schema offer cannot be used: conditional_offer' });
  // Another page's product, mended or not, is not this page's price.
  expect(extractProductHtml(mendedPage('', '', 'https://donne.com.tr/urun/other/'), donne))
    .toEqual({ status: 'not_found', error: 'Schema offer cannot be used: product_identity_unproven' });
});

test('a mended offer never overwrites a price another reader already found', () => {
  // The page's own meta price stands; the mended offer may only add the stock it
  // proves for exactly that amount.
  expect(extractProductHtml(mendedPage('', meta('550.00')), donne))
    .toEqual({ status: 'success', priceMinor: 55000, currency: 'TRY', availability: 'in_stock', source: 'meta' });
  expect(extractProductHtml(mendedPage('', meta('499.00')), donne))
    .toEqual({ status: 'success', priceMinor: 49900, currency: 'TRY', availability: 'unknown', source: 'meta' });
  expect(extractProductHtml(mendedPage(',"priceValidUntil":"2020-01-01"', meta('550.00')), donne))
    .toEqual({ status: 'success', priceMinor: 55000, currency: 'TRY', availability: 'unknown', source: 'meta' });
});

test('mended data is not stock evidence for the other readers', async () => {
  const { structuredAvailability } = await import('./availability');
  const { extractSchemaSelectedOffer } = await import('./schema-selected-offer');
  const html = mendedPage('');
  expect(structuredAvailability(html, 55000, 'TRY', donne)).toBe('unknown');
  expect(extractSchemaSelectedOffer(html, donne, 'ELBISE-1')).toBeNull();
});

// Codex 2026-09-23: a store may list its other colours as variants that carry no
// offer at all. Those plain cross-links say nothing and are left out; every other
// variant still has to hold up.
const modamizbirUrl = 'https://www.modamizbir.com/fume-beli-lastikli-dokuma-poplin-etek-180513';
const sized = (sku: string, extra: Node = {}) =>
  ({ '@type': 'Product', sku, offers: offer(120.99, 'OutOfStock', { url: modamizbirUrl }), ...extra });
const colourLink = (slug: string, extra: Node = {}) =>
  ({ '@type': 'Product', url: `https://www.modamizbir.com/${slug}`, ...extra });
const modamizbirPage = (variants: Node[], groupExtra: Node = {}) =>
  page([group(undefined, variants, groupExtra)], modamizbirUrl);

test('colour cross-links without an offer are left out of the group', () => {
  const sizes = ['622534', '622535', '622536'].map(sku => sized(sku));
  const links = ['siyah-etek-180514', 'yesil-etek-180515', 'murdum-etek-180516', 'saks-etek-180517'].map(slug => colourLink(slug));
  expect(readSchemaProductOffer(modamizbirPage([...sizes, ...links]), modamizbirUrl, now))
    .toEqual({ status: 'success', priceMinor: 12099, currency: 'TRY', availability: 'out_of_stock', source: 'json-ld' });
  expect(readSchemaProductOffer(modamizbirPage([...sizes, ...links.slice(0, 3)]), modamizbirUrl, now))
    .toMatchObject({ status: 'success', priceMinor: 12099 });
});

test.each([
  ['a size of this page whose offer is missing', [sized('1'), { '@type': 'Product', url: modamizbirUrl }], 'ambiguous_variant_offer'],
  ['a variant that claims nothing and offers nothing', [sized('1'), { '@type': 'Product', sku: '2' }], 'ambiguous_variant_offer'],
  ['another page with offers: null', [sized('1'), colourLink('siyah-etek-180514', { offers: null })], 'variant_identity_mismatch'],
  ['another page with an empty offer list', [sized('1'), colourLink('siyah-etek-180514', { offers: [] })], 'variant_identity_mismatch'],
  ['another page with an unusable offer', [sized('1'), colourLink('siyah-etek-180514', { offers: { '@type': 'Offer' } })], 'variant_identity_mismatch'],
  ['another page with a real offer', [sized('1'), colourLink('siyah-etek-180514', { offers: offer(120.99, 'OutOfStock') })], 'variant_identity_mismatch'],
  ['another store without an offer', [sized('1'), { '@type': 'Product', url: 'https://other.example/etek' }], 'variant_identity_mismatch'],
  ['only cross-links', [colourLink('siyah-etek-180514'), colourLink('yesil-etek-180515')], 'unsupported_variant_list'],
] as const)('is not a plain cross-link: %s', (_name, variants, reason) => {
  expect(readSchemaProductOffer(modamizbirPage([...variants]), modamizbirUrl, now)).toEqual({ status: 'rejected', reason });
});

test('a group summary is compared with the variants that carry an offer', () => {
  const variants = [sized('1'), sized('2'), colourLink('siyah-etek-180514')];
  const summary = (offerCount: number) => ({ '@type': 'AggregateOffer', lowPrice: 120.99, highPrice: 120.99, priceCurrency: 'TRY', offerCount });
  expect(readSchemaProductOffer(modamizbirPage(variants, { offers: summary(2) }), modamizbirUrl, now)).toMatchObject({ status: 'success', priceMinor: 12099 });
  // A count that takes in the link we left out is a contradiction, not a detail.
  expect(readSchemaProductOffer(modamizbirPage(variants, { offers: summary(3) }), modamizbirUrl, now)).toEqual({ status: 'rejected', reason: 'conflicting_group_offer' });
});

test.each([
  'http://www.modamizbir.com/other', 'ftp://www.modamizbir.com/other',
  'https://www.modamizbir.com:8443/other', 'https://user:pass@www.modamizbir.com/other',
])('cross-links must use the same origin without credentials: %s', url => {
  expect(readSchemaProductOffer(modamizbirPage([sized('1'), { '@type': 'Product', url }]), modamizbirUrl, now))
    .toEqual({ status: 'rejected', reason: 'variant_identity_mismatch' });
});
test('cross-link filtering does not hide a non-product variant node', () => {
  expect(readSchemaProductOffer(modamizbirPage([sized('1'), { '@type': 'WebPage', url: 'https://www.modamizbir.com/other' }]), modamizbirUrl, now))
    .toEqual({ status: 'rejected', reason: 'unsupported_variant' });
});
