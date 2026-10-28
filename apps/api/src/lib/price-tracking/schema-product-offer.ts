import { schemaAvailability, type Availability } from './availability';
import { trackingCurrency } from './currency';
import { readStockMicrodata } from './microdata-stock';
import { jsonLdBlocks, parseJsonLd, parseRepairedJsonLd } from './json-ld-blocks';
import { newinshopValidUntilReadings } from './newinshop-valid-until';
import { readUnitPriceSpecification } from './unit-price-specification';

/**
 * Price and stock of the page's own product for schema.org shapes the direct
 * Product/Offer reader does not cover: a ProductGroup with variants, a single
 * Offer priced only by a UnitPriceSpecification, and a product the page's own
 * WebPage names as its mainEntity. Price and stock always come from the same offers.
 * - absent: no such data for this page; other sources may be tried.
 * - rejected: this product's offers exist but cannot be used safely. They never
 *   become a price; a caller with no other price reports the reason. With
 *   contradiction set, the page's own data contradicts itself about this product,
 *   so no other source may answer for the address either.
 */
export type SchemaProductOffer =
  | { status: 'absent' }
  | { status: 'rejected'; reason: string; contradiction?: true }
  | { status: 'success'; priceMinor: number; currency: string; availability: Availability; source: OfferSource };

type OfferSource = 'json-ld' | 'unit-price-specification';
type Json = Record<string, unknown>;
type OfferRead = { priceMinor: number; currency: string; availability: Availability; source: OfferSource };
// A product reached through a WebPage's mainEntity keeps the nodes it was reached
// through: the page, and for the wrapped shape the element and its offer.
type MainEntity = { page: Json; element?: Json; offer?: Json; ambiguous: boolean };
type SchemaNode = { node: Json; repaired: boolean; main?: MainEntity };

const MAX_VARIANTS = 250;
const PRODUCT_CODES = ['sku', 'mpn', 'gtin', 'gtin8', 'gtin12', 'gtin13', 'gtin14', 'productID'];
const object = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);
const list = (value: unknown): unknown[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const hasType = (node: Json, type: string) =>
  node['@type'] === type || (Array.isArray(node['@type']) && node['@type'].includes(type));
const isPlainProduct = (node: Json) => hasType(node, 'Product') && !hasType(node, 'ProductGroup');
const rejected = (reason: string): SchemaProductOffer => ({ status: 'rejected', reason });
const contradicted = (reason: string): SchemaProductOffer => ({ status: 'rejected', reason, contradiction: true });
const hasSpecification = (node: Json) => list(node.offers).some(offer => object(offer) && 'priceSpecification' in offer);

export function readSchemaProductOffer(html: string, url: string, observedAt: Date): SchemaProductOffer {
  const page = new URL(url);
  // A WebPage that is not proven to be this page says nothing about its product.
  const nodes = schemaNodes(html).filter(entry => !entry.main || isPageProduct(entry.main.page, html, page));
  // A group that is not proven to be this page's product is someone else's data
  // and is left alone, as before.
  const groups = nodes.filter(entry => hasType(entry.node, 'ProductGroup') && isPageProduct(entry.node, html, page));
  const products = nodes.filter(entry => !hasType(entry.node, 'ProductGroup'));
  if (groups.length) {
    if (groups.length > 1 || products.some(entry => entry.main || isPageProduct(entry.node, html, page))) return rejected('ambiguous_product');
    return readGroup(groups[0]!.node, page, observedAt);
  }
  // A mended block is invisible to the direct reader, so this is the only place its
  // plain offer can be read, and only under the identity, date, condition, currency
  // and amount checks below. Blocks the page wrote correctly keep their own reader.
  // A product inside the page's own WebPage is invisible to it too, mended or not.
  if (!products.some(entry => hasSpecification(entry.node) || entry.repaired || entry.main)) return { status: 'absent' };
  if (products.length !== 1) return rejected('ambiguous_product');
  const product = products[0]!.node;
  const main = products[0]!.main;
  if (main) return readMainEntity(product, main, page, observedAt);
  if (!isPageProduct(product, html, page)) return rejected('product_identity_unproven');
  const offers = list(product.offers);
  if (offers.length !== 1) return rejected('ambiguous_offer');
  const read = readOffer(offers[0], page, observedAt);
  if ('reason' in read) return rejected(read.reason);
  return { status: 'success', ...read, availability: page.searchParams.has('variant') ? 'unknown' : read.availability };
}

// Top-level Product and ProductGroup nodes; variants stay inside their group. Data
// that only parses after repair is marked, so it is never mistaken for what the page
// wrote correctly. Unreadable JSON-LD proves nothing.
// A top-level WebPage or ItemPage adds the product it names as mainEntity, nothing
// else it holds (breadcrumb, reviews, related items); see mainEntityProducts.
function schemaNodes(html: string): SchemaNode[] {
  const nodes: SchemaNode[] = [];
  const walk = (value: unknown, repaired: boolean) => {
    if (Array.isArray(value)) { value.forEach(item => walk(item, repaired)); return; }
    if (!object(value)) return;
    if (hasType(value, 'Product') || hasType(value, 'ProductGroup')) nodes.push({ node: value, repaired });
    else if (hasType(value, 'WebPage') || hasType(value, 'ItemPage')) nodes.push(...mainEntityProducts(value, repaired));
    if (value['@graph']) walk(value['@graph'], repaired);
  };
  for (const block of jsonLdBlocks(html)) {
    const strict = parseJsonLd(block);
    if (strict !== undefined) walk(strict, false);
    else walk(parseRepairedJsonLd(block), true);
  }
  return nodes;
}

// Two shapes only: mainEntity is the Product itself, or its single Offer offers a
// single Product (sosyopix: WebPage.mainEntity.offers.itemOffered[0]). Every product
// found either way is returned, and one found next to a second entity, offer or
// item is marked ambiguous, so no candidate is ever chosen as the first of several.
function mainEntityProducts(page: Json, repaired: boolean): SchemaNode[] {
  const found: { product: Json; element?: Json; offer?: Json }[] = [];
  const entities = list(page.mainEntity);
  let single = entities.length === 1;
  for (const entity of entities) {
    if (!object(entity) || hasType(entity, 'ProductGroup')) continue;
    if (isPlainProduct(entity)) { found.push({ product: entity }); continue; }
    const offers = list(entity.offers);
    if (offers.length > 1) single = false;
    for (const offer of offers) {
      if (!object(offer) || !hasType(offer, 'Offer')) continue;
      const items = list(offer.itemOffered);
      if (items.length > 1) single = false;
      for (const item of items) if (object(item) && isPlainProduct(item)) found.push({ product: item, element: entity, offer });
    }
  }
  const ambiguous = !single || found.length !== 1;
  return found.map(({ product, element, offer }) => ({ node: product, repaired, main: { page, element, offer, ambiguous } }));
}

function samePage(raw: unknown, page: URL): boolean {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  try {
    const actual = new URL(raw, page);
    const path = (value: URL) => decodeURIComponent(value.pathname).normalize('NFC').replace(/\/$/, '');
    return actual.hostname.replace(/^www\./, '') === page.hostname.replace(/^www\./, '') && path(actual) === path(page);
  } catch {
    return false;
  }
}

// Where a node says it lives: its url, and its @id (without the fragment) when
// that names a page. A same-site root @id such as "https://shop/#/schema/Product/1"
// is a node name in the site's schema graph, not a page. A missing, null or empty
// value claims nothing.
const claimed = (value: unknown) => value !== undefined && value !== null && value !== '';
function identityClaims(node: Json, page: URL): unknown[] {
  const raw = node['@id'];
  let id: string | undefined;
  if (typeof raw === 'string' && /^(?:https?:\/\/|\/)/i.test(raw)) {
    const base = raw.split('#')[0] ?? raw;
    id = base;
    try {
      const named = new URL(raw, page);
      if (named.pathname === '/' && !named.search && /^#\/schema\/Product\/[^/]+$/.test(named.hash) &&
        named.protocol === page.protocol && named.port === page.port && !named.username && !named.password &&
        named.hostname.replace(/^www\./, '') === page.hostname.replace(/^www\./, '')) id = undefined;
    } catch { /* An unreadable @id stays a claim and fails the page check. */ }
  }
  return [node.url, id].filter(claimed);
}

// The node's claims, or with none the page's single canonical link, must be
// this page. A canonical pointing elsewhere (e.g. the home page) fails.
function isPageProduct(node: Json, html: string, page: URL): boolean {
  const canonicals = readStockMicrodata(html).canonicals;
  if (canonicals.length > 1 || (canonicals.length === 1 && !samePage(canonicals[0], page))) return false;
  const claims = identityClaims(node, page);
  return claims.length ? claims.every(claim => samePage(claim, page)) : canonicals.length === 1;
}

// readUnitPriceSpecification's offer rules, applied to direct prices as well: an
// offer outside its dates or tied to conditions is not the current price.
function offerLimit(offer: Json, observedAt: Date, page: URL): string | null {
  if (['eligibleQuantity', 'eligibleCustomerType', 'eligibleTransactionVolume', 'businessFunction'].some(key => key in offer)) {
    return 'conditional_offer';
  }
  if (!Number.isFinite(observedAt.getTime())) return 'invalid_observation_date';
  const today = observedAt.toISOString().slice(0, 10);
  for (const [key, lowerBound] of [['validFrom', true], ['validThrough', false], ['priceValidUntil', false]] as const) {
    if (!(key in offer)) continue;
    // newinshop's "10/04/2040" is read both ways, and both readings must hold.
    const readings = key === 'priceValidUntil' ? newinshopValidUntilReadings(page, offer[key]) : null;
    for (const value of readings ?? [offer[key]]) {
      const date = dateOnly(value);
      if (!date || (lowerBound ? date > today : date < today)) return 'offer_outside_validity';
    }
  }
  return null;
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function readOffer(offer: unknown, page: URL, observedAt: Date): OfferRead | { reason: string } {
  if (!object(offer) || offer['@type'] !== 'Offer') return { reason: 'unsupported_offer' };
  if (claimed(offer.url) && !samePage(offer.url, page)) return { reason: 'offer_identity_mismatch' };
  const availability = schemaAvailability(offer.availability);
  // A direct price, even null, is never replaced by a price specification.
  if ('price' in offer) {
    const limit = offerLimit(offer, observedAt, page);
    if (limit) return { reason: limit };
    const priceMinor = decimalMinor(offer.price);
    const currency = trackingCurrency(offer.priceCurrency);
    if (priceMinor === null) return { reason: 'invalid_price' };
    if (!currency) return { reason: 'unsupported_currency' };
    return { priceMinor, currency, availability, source: 'json-ld' };
  }
  const unit = readUnitPriceSpecification(offer, observedAt);
  if (unit.status === 'absent') return { reason: 'missing_price' };
  if (unit.status === 'rejected') return { reason: unit.reason };
  return { priceMinor: unit.priceMinor, currency: unit.currency, availability, source: unit.source };
}

// The product the page's own WebPage names as its mainEntity. Where the WebPage,
// the wrapping element and offer, the product or its offer name an address, it
// must be this page: another page or store here is the page contradicting itself.
// A link to this page with a query of its own (?variant=…, ?alloy=…) names one
// configuration, not the page. Product codes stated along the way must agree.
// Price and stock come from the product's own single offer under every check
// readOffer makes; the wrapping offer is never read as a price or stock, it may
// only agree: a different amount or currency there is a contradiction, a
// different stock state leaves stock unknown.
function readMainEntity(product: Json, main: MainEntity, page: URL, observedAt: Date): SchemaProductOffer {
  if (main.ambiguous) return rejected('ambiguous_main_entity');
  const offers = list(product.offers);
  const own = offers.length === 1 && object(offers[0]) ? offers[0] : undefined;
  const addresses = [...identityClaims(main.page, page), main.element?.url, main.offer?.url, ...identityClaims(product, page), own?.url]
    .filter(claimed);
  if (addresses.some(address => !samePage(address, page))) return contradicted('main_entity_identity_conflict');
  if (addresses.some(address => !sameQuery(address, page))) return rejected('main_entity_variant_address');
  const codes = [main.element, main.offer, product, own];
  if (PRODUCT_CODES.some(key => new Set(codes.flatMap(node => (node && claimed(node[key]) ? [codeText(node[key])] : []))).size > 1)) {
    return contradicted('main_entity_identity_conflict');
  }
  if (offers.length !== 1) return rejected('ambiguous_offer');
  const read = readOffer(offers[0], page, observedAt);
  if ('reason' in read) return rejected(read.reason);
  let availability = read.availability;
  const outer = main.offer;
  if (outer) {
    const limit = offerLimit(outer, observedAt, page);
    if (limit) return rejected(limit);
    if (['priceSpecification', 'lowPrice', 'highPrice'].some(key => claimed(outer[key]))) return rejected('unsupported_main_entity_offer');
    if ((claimed(outer.price) && decimalMinor(outer.price) !== read.priceMinor) ||
      (claimed(outer.priceCurrency) && trackingCurrency(outer.priceCurrency) !== read.currency)) return contradicted('main_entity_offer_conflict');
    const state = schemaAvailability(outer.availability);
    if (state !== 'unknown' && state !== availability) availability = 'unknown';
  }
  return { status: 'success', ...read, availability: page.searchParams.has('variant') ? 'unknown' : availability };
}

function sameQuery(raw: unknown, page: URL): boolean {
  try {
    const actual = new URL(String(raw), page);
    return !actual.search || actual.search === page.search;
  } catch {
    return false;
  }
}

const codeText = (value: unknown) => (typeof value === 'string' ? value.trim() : JSON.stringify(value));

// A plain link to another product page of the same store: a variant with no offers
// key at all whose own claims all name another path here (modamizbir lists its other
// colours this way). It says nothing about price or stock, so it is left out.
// Everything else stays a variant that has to hold up: this page's own identity, no
// identity at all, offers: null, an empty list or an unusable offer may be a size
// whose data is missing, and another store's address is not a link of ours.
function isCrossLink(variant: Json, page: URL): boolean {
  if (!hasType(variant, 'Product') || 'offers' in variant) return false;
  const claims = identityClaims(variant, page);
  return claims.length > 0 && claims.every(claim => namesAnotherPageHere(claim, page));
}

function namesAnotherPageHere(raw: unknown, page: URL): boolean {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  try {
    const actual = new URL(raw, page);
    const path = (value: URL) => decodeURIComponent(value.pathname).normalize('NFC').replace(/\/$/, '');
    return actual.protocol === page.protocol && actual.port === page.port && !actual.username && !actual.password &&
      actual.hostname.replace(/^www\./, '') === page.hostname.replace(/^www\./, '') &&
      path(actual) !== '' && path(actual) !== path(page);
  } catch {
    return false;
  }
}

function readGroup(group: Json, page: URL, observedAt: Date): SchemaProductOffer {
  const listed = list(group.hasVariant);
  if (!listed.length || listed.length > MAX_VARIANTS) return rejected('unsupported_variant_list');
  const variants = listed.filter(variant => !object(variant) || !isCrossLink(variant, page));
  if (!variants.length) return rejected('unsupported_variant_list');
  const reads: OfferRead[] = [];
  for (const variant of variants) {
    if (!object(variant) || !hasType(variant, 'Product')) return rejected('unsupported_variant');
    // A variant naming another page is not this page's variant. Sibling pages
    // (e.g. one page per colour) would need their own membership proof.
    if (identityClaims(variant, page).some(claim => !samePage(claim, page))) return rejected('variant_identity_mismatch');
    const offers = list(variant.offers);
    if (offers.length !== 1) return rejected('ambiguous_variant_offer');
    const read = readOffer(offers[0], page, observedAt);
    if ('reason' in read) return rejected(read.reason);
    reads.push(read);
  }
  const first = reads[0]!;
  if (reads.some(read => read.source !== first.source)) return rejected('mixed_price_sources');
  if (reads.some(read => read.currency !== first.currency)) return rejected('mixed_currencies');
  // No minimum or default-variant price: every variant must cost the same.
  if (reads.some(read => read.priceMinor !== first.priceMinor)) return rejected('mixed_variant_prices');
  const states = reads.map(read => read.availability);
  let availability: Availability = states.every(state => state === 'in_stock') ? 'in_stock'
    : states.every(state => state === 'out_of_stock') ? 'out_of_stock' : 'unknown';
  // A group-level summary must agree with the variants that carry an offer; a count
  // that also takes in the links we left out is a contradiction, not a detail.
  for (const offer of list(group.offers)) {
    if (!object(offer)) return rejected('unsupported_group_offer');
    if (offer['@type'] === 'AggregateOffer') {
      const limit = offerLimit(offer, observedAt, page);
      if (limit) return rejected(limit);
      if (decimalMinor(offer.lowPrice) !== first.priceMinor || decimalMinor(offer.highPrice) !== first.priceMinor ||
        trackingCurrency(offer.priceCurrency) !== first.currency ||
        (offer.offerCount !== undefined && Number(offer.offerCount) !== variants.length)) return rejected('conflicting_group_offer');
    } else {
      const read = readOffer(offer, page, observedAt);
      if ('reason' in read) return rejected(read.reason);
      if (read.priceMinor !== first.priceMinor || read.currency !== first.currency) return rejected('conflicting_group_offer');
    }
    const state = schemaAvailability(offer.availability);
    if (state !== 'unknown' && state !== availability) availability = 'unknown';
  }
  // A saved size never inherits the group's stock.
  if (page.searchParams.has('variant')) availability = 'unknown';
  return { status: 'success', priceMinor: first.priceMinor, currency: first.currency, availability, source: first.source };
}

// schema.org prices use a dot decimal and no grouping: "656.99", 656.99, "1500".
function decimalMinor(value: unknown): number | null {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return minor > 0 ? minor : null;
}
