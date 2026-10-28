import { afterEach, expect, test } from 'bun:test';
import { structuredAvailability } from './availability';
import { extractProductHtml } from './extract-product-price';
import { jsonLdBlocks, parseJsonLd } from './json-ld-blocks';
import { resolveProductPrice } from './price-source-router';
import { readSchemaProductOffer } from './schema-product-offer';

// sosyopix (saved 2026-09-25, bodies 81da827bfec1… and 0ca64ea8a786…) has no
// top-level Product. Its WebPage names a WebPageElement as mainEntity, whose single
// Offer offers a single Product, and that Product's own Offer carries price and
// stock. The saved block parses only after repair (a raw line break inside a
// review), so every case is read twice: as the page wrote it, and as valid JSON.
const now = new Date('2026-09-25T12:00:00Z');
const URL_A = 'https://www.sosyopix.com/10x15-yildizli-isiltili-cerceve-p-10019';
const OTHER = 'https://www.sosyopix.com/14-mart-tip-bayrami-hediye-kutusu-p-10773';
const BREAK = String.fromCharCode(10);
type Version = 'mended' | 'valid';
const VERSIONS: Version[] = ['mended', 'valid'];
type Node = Record<string, unknown>;

const innerOffer = (extra: Node = {}): Node => ({ '@type': 'Offer', availability: 'https://schema.org/InStock', url: URL_A,
  price: '449.90', priceCurrency: 'TRY', areaServed: 'TR', itemCondition: 'https://schema.org/NewCondition', ...extra });
const product = (extra: Node = {}): Node => ({ '@type': 'Product', name: '10x15 Yıldızlı Işıltılı Çerçeve', sku: '10019', mpn: '10019',
  category: 'Doğum Günü Hediyesi', brand: { '@type': 'Thing', name: 'Sosyopix' }, offers: innerOffer(),
  review: [{ '@type': 'Review', reviewBody: 'Çok beğendik, teşekkürler' }], ...extra });
const outerOffer = (extra: Node = {}): Node => ({ '@type': 'Offer', availability: 'https://schema.org/InStock',
  name: '10x15 Yıldızlı Işıltılı Çerçeve', sku: '10019', mpn: '10019', url: URL_A, itemOffered: [product()], ...extra });
const element = (extra: Node = {}): Node => ({ '@type': 'WebPageElement', offers: outerOffer(), ...extra });
const webPage = (extra: Node = {}): Node => ({ '@context': 'https://schema.org', '@type': 'WebPage', name: '10x15 Yıldızlı Işıltılı Çerçeve',
  url: URL_A, breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, item: { name: 'Sosyopix', '@id': 'https://www.sosyopix.com/' } },
    { '@type': 'ListItem', position: 2, item: { name: '10x15 Yıldızlı Işıltılı Çerçeve', '@id': URL_A } }] },
  mainEntity: element(), ...extra });
const wrapped = (offer: Node) => webPage({ mainEntity: element({ offers: offer }) });
const withProduct = (node: Node) => wrapped(outerOffer({ itemOffered: [node] }));

// Every block as the page wrote it; the mended version breaks the first review
// line of the page, as the saved body does, so its block needs the repair.
const page = (nodes: Node[], version: Version, { canonical = URL_A as string | null, head = '' } = {}) => {
  let broken = version === 'valid';
  const blocks = nodes.map(node => {
    const json = JSON.stringify(node);
    if (broken || !json.includes('teşekkürler')) return json;
    broken = true;
    return json.replace('teşekkürler', `teşekkürler${BREAK}`);
  });
  if (!broken) throw new Error('the mended page needs a review to break');
  return `<html><head>${canonical ? `<link rel="canonical" href="${canonical}" />` : ''}${blocks
    .map(json => `<script type="application/ld+json">${json}</script>`).join('')}${head}</head><body></body></html>`;
};
const read = (html: string, url = URL_A) => readSchemaProductOffer(html, url, now);
const meta = (amount: string) => `<meta property="product:price:amount" content="${amount}"><meta property="product:price:currency" content="TRY">`;
const SUCCESS = { status: 'success', priceMinor: 44990, currency: 'TRY', availability: 'in_stock', source: 'json-ld' } as const;

test.each(VERSIONS)('the saved shape needs the repair, its valid twin does not (%s)', version => {
  const [block] = jsonLdBlocks(page([webPage()], version));
  expect(parseJsonLd(block!) === undefined).toBe(version === 'mended');
});

test.each(VERSIONS)('the product the page names as its main entity is read (%s)', version => {
  const html = page([webPage()], version);
  expect(read(html)).toEqual(SUCCESS);
  expect(extractProductHtml(html, URL_A)).toEqual(SUCCESS);
});

test('a product that is itself the main entity of an ItemPage', () => {
  // sevil: an ItemPage without url, identified by its single canonical link; the
  // product's @id and its offer name this page. A direct price is never replaced
  // by the offer's price specification.
  const url = 'https://www.sevil.com.tr/la-prairie-platinum-rare-haute-rejuvenation-cream-50ml-nemlendirici.html';
  const itemPage = { '@context': 'https://schema.org/', '@type': 'ItemPage', mainEntity: { '@type': 'Product', '@id': `${url}#Product`,
    sku: 'AR-LP131828', gtin: '7611773162661', offers: { '@type': 'Offer', url, price: '107600', priceCurrency: 'TRY',
      availability: 'http://schema.org/InStock', priceSpecification: { '@type': 'UnitPriceSpecification', price: '107600', priceCurrency: 'TRY', valueAddedTaxIncluded: 'true' } } } };
  const html = (head = '', canonical: string | null = url) =>
    `<html><head>${canonical ? `<link rel="canonical" href="${canonical}" />` : ''}<script type="application/ld+json">${JSON.stringify(itemPage)}</script>${head}</head></html>`;
  expect(read(html(), url)).toEqual({ ...SUCCESS, priceMinor: 10760000 });
  expect(read(html('', null), url)).toEqual({ status: 'absent' });
  // The older readers still answer first; the main entity adds the stock it
  // proves for exactly that amount, and nothing for another one.
  expect(extractProductHtml(html(meta('107600')), url)).toEqual({ ...SUCCESS, priceMinor: 10760000, source: 'meta' });
  expect(extractProductHtml(html(meta('99000')), url)).toEqual({ ...SUCCESS, priceMinor: 9900000, availability: 'unknown', source: 'meta' });
});

// Only the page's own main entity counts: another page's WebPage, or a product
// the page merely mentions, is someone else's data and leaves the other readers
// and providers free, as any page without a usable price does.
const ABSENT: [string, (version: Version) => string][] = [
  ['another page\'s WebPage', v => page([webPage({ url: OTHER })], v)],
  ['a WebPage @id of another page', v => page([webPage({ '@id': `${OTHER}#webpage` })], v)],
  ['a WebPage without address and a canonical of another page', v => page([webPage({ url: undefined })], v, { canonical: OTHER })],
  ['a WebPage without address and without canonical', v => page([webPage({ url: undefined })], v, { canonical: null })],
  ['two canonical links', v => page([webPage()], v, { head: `<link rel="canonical" href="${URL_A}" />` })],
  ['a product the page is only related to', v => page([webPage({ mainEntity: { '@type': 'WebPageElement' }, isRelatedTo: product() })], v)],
  ['a reviewed product', v => page([webPage({ mainEntity: undefined, review: { '@type': 'Review', itemReviewed: product() } })], v)],
  ['a product in the breadcrumb', v => page([webPage({ mainEntity: undefined, breadcrumb: { '@type': 'BreadcrumbList',
    itemListElement: [{ '@type': 'ListItem', position: 1, item: product() }] } })], v)],
  ['a list of recommended products', v => page([webPage({ mainEntity: { '@type': 'ItemList',
    itemListElement: [{ '@type': 'ListItem', position: 1, item: product() }, { '@type': 'ListItem', position: 2, item: product({ sku: '10773' }) }] } })], v)],
  ['a product that is part of the page', v => page([webPage({ mainEntity: undefined, hasPart: [product()] })], v)],
  ['a product group as main entity', v => page([webPage({ mainEntity: { ...product(), '@type': 'ProductGroup' } })], v)],
  ['an offer of a service', v => page([wrapped(outerOffer({ itemOffered: [{ '@type': 'Service', name: 'Baskı', review: product().review }] }))], v)],
  ['a main entity inside a collection page', v => page([{ ...webPage(), '@type': 'CollectionPage' }], v)],
];

test.each(VERSIONS.flatMap(version => ABSENT.map(([name, html]) => [name, version, html] as const)))('%s is not this page\'s product (%s)', (_name, version, html) => {
  expect(read(html(version))).toEqual({ status: 'absent' });
  expect(extractProductHtml(html(version), URL_A)).toEqual({ status: 'not_found', error: 'No supported product price found' });
});

// The page's own statements about its product disagree: no price, and marked so
// that no other provider answers over it either.
const CONTRADICTED: [string, (version: Version) => string, string][] = [
  ['the wrapping offer names another page', v => page([wrapped(outerOffer({ url: OTHER }))], v), 'main_entity_identity_conflict'],
  ['the element names another page', v => page([webPage({ mainEntity: element({ url: OTHER }) })], v), 'main_entity_identity_conflict'],
  ['the product names another page', v => page([withProduct(product({ url: OTHER }))], v), 'main_entity_identity_conflict'],
  ['the product @id names another store', v => page([withProduct(product({ '@id': 'https://other.example/p/10019#product' }))], v), 'main_entity_identity_conflict'],
  ['the product offer names another page', v => page([withProduct(product({ offers: innerOffer({ url: OTHER }) }))], v), 'main_entity_identity_conflict'],
  ['the wrapping offer states another sku', v => page([wrapped(outerOffer({ sku: '10773' }))], v), 'main_entity_identity_conflict'],
  ['the product offer states another gtin', v => page([withProduct(product({ gtin13: '8690000000001', offers: innerOffer({ gtin13: '8690000000002' }) }))], v), 'main_entity_identity_conflict'],
  ['the wrapping offer states another amount', v => page([wrapped(outerOffer({ price: '399.90', priceCurrency: 'TRY' }))], v), 'main_entity_offer_conflict'],
  ['the wrapping offer states another currency', v => page([wrapped(outerOffer({ priceCurrency: 'USD' }))], v), 'main_entity_offer_conflict'],
  ['the wrapping offer states a zero price', v => page([wrapped(outerOffer({ price: '0' }))], v), 'main_entity_offer_conflict'],
];

test.each(VERSIONS.flatMap(version => CONTRADICTED.map(([name, html, reason]) => [name, version, html, reason] as const)))('%s is a contradiction (%s)', (_name, version, html, reason) => {
  expect(read(html(version))).toEqual({ status: 'rejected', reason, contradiction: true });
  expect(extractProductHtml(html(version), URL_A)).toEqual({ status: 'not_found', contradiction: true, error: `Schema offer cannot be used: ${reason}` });
});

// Unusable for this page, but not a contradiction: never a price, and the next
// provider may still try, as for every other schema offer that cannot be used.
const spec = (extra: Node = {}) => [{ '@type': 'UnitPriceSpecification', price: '449.90', priceCurrency: 'TRY', valueAddedTaxIncluded: true, ...extra }];
const REJECTED: [string, (version: Version) => string, string][] = [
  ['two main entities', v => page([webPage({ mainEntity: [element(), element()] })], v), 'ambiguous_product'],
  ['a main entity next to another entity', v => page([webPage({ mainEntity: [element(), { '@type': 'Organization', name: 'Sosyopix' }] })], v), 'ambiguous_main_entity'],
  ['two wrapping offers', v => page([webPage({ mainEntity: element({ offers: [outerOffer(), outerOffer()] }) })], v), 'ambiguous_product'],
  ['a second wrapping offer without a product', v => page([webPage({ mainEntity: element({ offers: [outerOffer(),
    { '@type': 'Offer', price: '449.90', priceCurrency: 'TRY' }] }) })], v), 'ambiguous_main_entity'],
  ['two offered products', v => page([wrapped(outerOffer({ itemOffered: [product(), product({ sku: '10773', mpn: '10773' })] }))], v), 'ambiguous_product'],
  ['an offered product next to another item', v => page([wrapped(outerOffer({ itemOffered: [product(), { '@type': 'Service', name: 'Hediye paketi' }] }))], v), 'ambiguous_main_entity'],
  ['the same WebPage twice', v => page([webPage(), webPage()], v), 'ambiguous_product'],
  ['a top-level product next to the main entity', v => page([webPage(), product({ url: URL_A, offers: innerOffer({ price: undefined }) })], v), 'ambiguous_product'],
  ['a product with two offers', v => page([withProduct(product({ offers: [innerOffer(), innerOffer()] }))], v), 'ambiguous_offer'],
  ['a product offer for one configuration of the page', v => page([withProduct(product({ offers: innerOffer({ url: `${URL_A}?renk=altin` }) }))], v), 'main_entity_variant_address'],
  ['a wrapping offer for a selected variant', v => page([wrapped(outerOffer({ url: `${URL_A}?variant=5` }))], v), 'main_entity_variant_address'],
  ['a zero price', v => page([withProduct(product({ offers: innerOffer({ price: '0' }) }))], v), 'invalid_price'],
  ['a comma decimal', v => page([withProduct(product({ offers: innerOffer({ price: '449,90' }) }))], v), 'invalid_price'],
  ['no currency', v => page([withProduct(product({ offers: innerOffer({ priceCurrency: undefined }) }))], v), 'unsupported_currency'],
  ['a zero-decimal currency', v => page([withProduct(product({ offers: innerOffer({ priceCurrency: 'JPY' }) }))], v), 'unsupported_currency'],
  ['a price only on the wrapping offer', v => page([wrapped(outerOffer({ price: '449.90', priceCurrency: 'TRY',
    itemOffered: [product({ offers: innerOffer({ price: undefined, priceCurrency: undefined }) })] }))], v), 'missing_price'],
  ['an expired product offer', v => page([withProduct(product({ offers: innerOffer({ priceValidUntil: '2020-01-01' }) }))], v), 'offer_outside_validity'],
  ['an expired wrapping offer', v => page([wrapped(outerOffer({ priceValidUntil: '2020-01-01' }))], v), 'offer_outside_validity'],
  ['a conditional product offer', v => page([withProduct(product({ offers: innerOffer({ eligibleQuantity: { minValue: 2 } }) }))], v), 'conditional_offer'],
  ['a conditional wrapping offer', v => page([wrapped(outerOffer({ eligibleCustomerType: 'Business' }))], v), 'conditional_offer'],
  ['a unit price without VAT', v => page([withProduct(product({ offers: innerOffer({ price: undefined, priceSpecification: spec({ valueAddedTaxIncluded: false }) }) }))], v), 'tax_inclusive_price_unproven'],
  ['a wrapping offer priced by a specification', v => page([wrapped(outerOffer({ priceSpecification: spec() }))], v), 'unsupported_main_entity_offer'],
  ['an aggregate product offer', v => page([withProduct(product({ offers: { '@type': 'AggregateOffer', lowPrice: '449.90', highPrice: '449.90', priceCurrency: 'TRY' } }))], v), 'unsupported_offer'],
];

test.each(VERSIONS.flatMap(version => REJECTED.map(([name, html, reason]) => [name, version, html, reason] as const)))('%s is rejected (%s)', (_name, version, html, reason) => {
  expect(read(html(version))).toEqual({ status: 'rejected', reason });
  expect(extractProductHtml(html(version), URL_A)).toEqual({ status: 'not_found', error: `Schema offer cannot be used: ${reason}` });
});

test.each(VERSIONS)('the wrapping offer never lends its stock (%s)', version => {
  // It may agree on the amount; a stock state it does not share leaves stock unknown.
  expect(read(page([wrapped(outerOffer({ price: '449.90', priceCurrency: 'TRY' }))], version))).toEqual(SUCCESS);
  expect(read(page([wrapped(outerOffer({ availability: 'https://schema.org/OutOfStock' }))], version))).toEqual({ ...SUCCESS, availability: 'unknown' });
  expect(read(page([withProduct(product({ offers: innerOffer({ availability: undefined }) }))], version))).toEqual({ ...SUCCESS, availability: 'unknown' });
  expect(read(page([wrapped(outerOffer({ availability: undefined, itemOffered: [product({ offers: innerOffer({ availability: 'https://schema.org/OutOfStock' }) })] }))], version)))
    .toEqual({ ...SUCCESS, availability: 'out_of_stock' });
});

test.each(VERSIONS)('a saved or selected variant address never inherits the stock (%s)', version => {
  const html = page([webPage()], version);
  expect(read(html, `${URL_A}?variant=5`)).toEqual({ ...SUCCESS, availability: 'unknown' });
  expect(extractProductHtml(html, `${URL_A}?variant=5`)).toEqual({ ...SUCCESS, availability: 'unknown' });
  expect(extractProductHtml(html, `${URL_A}?_butika_variant=offer:10019`)).toEqual({ status: 'not_found', error: 'Selected variant cannot be verified' });
});

test.each(VERSIONS)('in the chain the main entity only fills a gap (%s)', version => {
  expect(extractProductHtml(page([webPage()], version, { head: meta('449.90') }), URL_A)).toEqual({ ...SUCCESS, source: 'meta' });
  expect(extractProductHtml(page([webPage()], version, { head: meta('539.90') }), URL_A)).toEqual({ ...SUCCESS, priceMinor: 53990, availability: 'unknown', source: 'meta' });
  // A contradiction adds nothing to another reader's price either.
  expect(extractProductHtml(page([wrapped(outerOffer({ url: OTHER }))], version, { head: meta('449.90') }), URL_A)).toEqual({ ...SUCCESS, availability: 'unknown', source: 'meta' });
  // Unchanged: a priced top-level Product is the direct reader's, as before this path existed.
  const direct = product({ url: URL_A, offers: innerOffer({ price: '399.90' }), review: undefined });
  expect(extractProductHtml(page([webPage(), direct], version), URL_A)).toMatchObject({ status: 'success', priceMinor: 39990, source: 'json-ld' });
});

test.each(VERSIONS)('the older stock reader takes no evidence from the main entity (%s)', version => {
  expect(structuredAvailability(page([webPage()], version), 44990, 'TRY', URL_A)).toBe('unknown');
});

test('the input data is not changed', () => {
  const node = webPage();
  const before = JSON.stringify(node);
  read(page([node], 'valid'));
  read(page([node], 'mended'));
  expect(JSON.stringify(node)).toBe(before);
});

// The router, with the network replaced: the page and a WooCommerce Store answer
// any provider would accept, at another amount, so a fallback would be visible.
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const SLUG = '10x15-yildizli-isiltili-cerceve-p-10019';
const STORE = `https://www.sosyopix.com/wp-json/wc/store/v1/products?slug=${SLUG}`;

function serve(html: string) {
  const requested: string[] = [];
  const unexpected: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const href = String(input instanceof Request ? input.url : input);
    requested.push(href);
    if (href === URL_A) return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (href === STORE) return new Response(JSON.stringify([{ id: 10019, name: 'Çerçeve', slug: SLUG, permalink: URL_A, type: 'simple',
      is_purchasable: true, prices: { price: '39990', regular_price: '39990', sale_price: '39990', currency_code: 'TRY', currency_minor_unit: 2 } }]),
    { headers: { 'content-type': 'application/json' } });
    unexpected.push(href);
    throw new Error(`Unexpected network request: ${href}`);
  }) as typeof fetch;
  return { requested, unexpected };
}

test.each(VERSIONS)('the resolver answers from the page with one request (%s)', async version => {
  const { requested, unexpected } = serve(page([webPage()], version));
  expect(await resolveProductPrice({ url: URL_A })).toMatchObject({ status: 'success', observation: { priceMinor: 44990, currency: 'TRY',
    availability: 'in_stock', provider: 'structured_html', method: 'json-ld' } });
  expect(requested).toEqual([URL_A]);
  expect(unexpected).toEqual([]);
});

test.each(VERSIONS.flatMap(version => CONTRADICTED.map(([name, html, reason]) => [name, version, html, reason] as const)))('a contradiction is not answered by the next provider: %s (%s)', async (_name, version, html, reason) => {
  const { requested, unexpected } = serve(html(version));
  const resolved = await resolveProductPrice({ url: URL_A });
  expect(resolved).toMatchObject({ status: 'failed', reason: 'not_found', error: `Schema offer cannot be used: ${reason}` });
  expect(resolved.attempts.map(attempt => attempt.provider)).toEqual(['structured_html']);
  expect(requested).toEqual([URL_A]);
  expect(unexpected).toEqual([]);
});

test.each(VERSIONS.flatMap(version => ([
  ['another page\'s WebPage', page([webPage({ url: OTHER })], version)],
  ['a product the page is only related to', page([webPage({ mainEntity: { '@type': 'WebPageElement' }, isRelatedTo: product() })], version)],
  ['two offered products', page([wrapped(outerOffer({ itemOffered: [product(), product({ sku: '10773', mpn: '10773' })] }))], version)],
  ['a product offer for one configuration', page([withProduct(product({ offers: innerOffer({ url: `${URL_A}?renk=altin` }) }))], version)],
] as [string, string][]).map(([name, html]) => [name, version, html] as const)))('an ordinary gap still falls back to the next provider: %s (%s)', async (_name, _version, html) => {
  const { requested, unexpected } = serve(html);
  expect(await resolveProductPrice({ url: URL_A })).toMatchObject({ status: 'success',
    observation: { priceMinor: 39990, currency: 'TRY', provider: 'woocommerce' } });
  expect(requested).toEqual([URL_A, URL_A, STORE]);
  expect(unexpected).toEqual([]);
});
