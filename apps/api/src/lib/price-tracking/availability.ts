export type Availability = 'in_stock' | 'out_of_stock' | 'unknown';
import { ticimaxAvailability } from './ticimax-availability';
import { readStockMicrodata } from './microdata-stock';
import { jsonLdBlocks, parseJsonLd } from './json-ld-blocks';
import { ikasProductAvailability, readIkasProduct } from './ikas-stock';
import { trackingCurrency } from './currency';
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function schemaAvailability(value: unknown): Availability {
  if (typeof value !== 'string') return 'unknown';
  const status = value.replace(/^https?:\/\/schema.org\//i, '').replace(/[ _-]/g, '').toLowerCase();
  if (status === 'instock') return 'in_stock';
  if (['outofstock', 'soldout', 'discontinued'].includes(status)) return 'out_of_stock';
  return 'unknown';
}

export function shopifyAvailability(product: Record<string, unknown>, variantId: string | null): Availability {
  if (!Array.isArray(product.variants)) return 'unknown';
  const variants = product.variants.filter(obj).filter(v => !variantId || String(v.id) === variantId);
  if (!variants.length) return 'unknown';
  if (variants.every(v => v.available === false)) return 'out_of_stock';
  if (variants.every(v => v.available === true)) return 'in_stock';
  return 'unknown'; // Another size's stock does not prove the user's size is available.
}

export function wooAvailability(product: { is_in_stock?: unknown; is_purchasable?: unknown; is_on_backorder?: unknown; type?: unknown; stock_availability?: unknown }): Availability {
  if (product.is_in_stock === false || product.is_purchasable === false) return 'out_of_stock';
  if (product.type !== 'simple' && product.type !== 'variation') return 'unknown';
  // Woo may report is_on_backorder=false when backorder notices are disabled.
  const stockClass = obj(product.stock_availability) ? product.stock_availability.class : null;
  return product.is_in_stock === true && product.is_purchasable === true && product.is_on_backorder === false && stockClass === 'in-stock' ? 'in_stock' : 'unknown';
}

// A single product, matching price/currency, no aggregate minimum or variant guessing.
export function structuredAvailability(html: string, priceMinor: number, currency: string, url: string): Availability {
  if (new URL(url).searchParams.has('variant')) return 'unknown';
  if (readIkasProduct(html)) return ikasProductAvailability(html,url,priceMinor,currency);
  // An embedded variant model has stronger product/size evidence than a
  // generic Offer. Its ambiguity must not be bypassed by optimistic metadata.
  if (/\b(?:var|let|const)\s+productDetailModel\s*=/.test(html)) {
    const metadata = readStockMicrodata(html);
    if (metadata.canonicals.length !== 1 || !sameStockProduct(metadata.canonicals[0]!, url)) return 'unknown';
    return ticimaxAvailability(html, priceMinor, currency);
  }
  const products: Record<string, unknown>[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!obj(v)) return;
    if (v['@type'] === 'Product' || (Array.isArray(v['@type']) && v['@type'].includes('Product'))) products.push(v);
    if (v['@graph']) walk(v['@graph']);
  };
  // Unreadable JSON-LD proves nothing; stock stays unknown.
  for (const block of jsonLdBlocks(html)) walk(parseJsonLd(block));
  if (products.length === 0) return microdataAvailability(html, priceMinor, currency, url);
  if (products.length !== 1) return 'unknown';
  const product = products[0]!;
  if (typeof product.url === 'string') {
    try {
      const actual = new URL(product.url, url), wanted = new URL(url);
      if (actual.hostname !== wanted.hostname || actual.pathname.replace(/\/$/, '') !== wanted.pathname.replace(/\/$/, '')) return 'unknown';
    } catch { return 'unknown'; }
  }
  const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
  if (!offers.length || offers.some(o => !obj(o) || o['@type'] === 'AggregateOffer' ||
    !['number', 'string'].includes(typeof o.price) || Math.round(Number(o.price) * 100) !== priceMinor ||
    trackingCurrency(o.priceCurrency) !== trackingCurrency(currency))) return 'unknown';
  const values = offers.map(o => schemaAvailability((o as Record<string, unknown>).availability));
  return values.every(v => v === 'in_stock') ? 'in_stock' : values.every(v => v === 'out_of_stock') ? 'out_of_stock' : 'unknown';
}

function sameStockProduct(candidate: string, url: string): boolean {
  if (!candidate.trim()) return false;
  try {
    const actual = new URL(candidate, url), expected = new URL(url);
    return actual.hostname.replace(/^www\./, '') === expected.hostname.replace(/^www\./, '') &&
      decodeURIComponent(actual.pathname).normalize('NFC').replace(/\/$/, '') === decodeURIComponent(expected.pathname).normalize('NFC').replace(/\/$/, '') &&
      !actual.searchParams.has('variant');
  } catch { return false; }
}

function microdataAvailability(html: string, priceMinor: number, currency: string, url: string): Availability {
  const metadata = readStockMicrodata(html);
  if (!metadata.complete || metadata.products.length !== 1) return 'unknown';
  const product = metadata.products[0]!;
  const offers = metadata.offers.filter(o => o.parent === product);
  if (!offers.length) return 'unknown';
  const urls = [...(product.props.url ?? []), ...offers.flatMap(o => o.props.url ?? [])];
  if (!urls.length || urls.some(u => !sameStockProduct(u, url))) return 'unknown';
  if (offers.some(o => o.props.price?.length !== 1 || !o.props.price[0]?.trim() || Math.round(Number(o.props.price[0]) * 100) !== priceMinor ||
    o.props.priceCurrency?.length !== 1 || o.props.priceCurrency[0]?.toUpperCase() !== currency.toUpperCase() || o.props.availability?.length !== 1)) return 'unknown';
  const states = offers.map(o => schemaAvailability(o.props.availability![0]));
  return states.every(s => s === 'in_stock') ? 'in_stock' : states.every(s => s === 'out_of_stock') ? 'out_of_stock' : 'unknown';
}
