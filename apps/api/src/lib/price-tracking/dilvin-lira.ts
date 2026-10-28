import { extractAssignedJsonObject } from './assigned-json';
import { jsonLdBlocks, parseJsonLd } from './json-ld-blocks';

// Dilvin labels today's lira with the retired ISO code TRL. It is read as TRY only
// on dilvin.com.tr, and only when the page's own product shows the same amount in
// TL twice: in its SKU-matched embedded product data and in the page's single
// visible product price block. A TL price elsewhere on the page (for example a
// recommended product) is not evidence. There is no general TRL mapping.
const HOSTS = new Set(['dilvin.com.tr', 'www.dilvin.com.tr']);
type Json = Record<string, unknown>;
const object = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);

export function isVerifiedDilvinLira(html: string, url: string, priceMinor: number): boolean {
  const page = new URL(url);
  if (!HOSTS.has(page.hostname.toLowerCase()) || page.searchParams.has('_butika_variant')) return false;
  const sku = labelledProductSku(html, page, priceMinor);
  if (!sku) return false;
  try {
    const embedded = JSON.parse(extractAssignedJsonObject(html, 'jspValue') ?? 'null') as unknown;
    if (!object(embedded) || embedded.SKU !== sku || dotMinor(embedded.Price) !== priceMinor) return false;
    if (liraMinor(embedded.PriceText) !== priceMinor) return false;
  } catch {
    return false;
  }
  return visiblePriceMinor(html) === priceMinor;
}

// The single JSON-LD Product of this page, with one TRL offer of this amount.
function labelledProductSku(html: string, page: URL, priceMinor: number): string | null {
  const products: Json[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!object(value)) return;
    if (value['@type'] === 'Product' || value['@type'] === 'ProductGroup') products.push(value);
    if (value['@graph']) walk(value['@graph']);
  };
  for (const block of jsonLdBlocks(html)) {
    const data = parseJsonLd(block);
    if (data === undefined) return null;
    walk(data);
  }
  const product = products.length === 1 ? products[0]! : null;
  if (!product || product['@type'] !== 'Product' || typeof product.sku !== 'string' || !product.sku.trim()) return null;
  if (!samePage(product.url, page)) return null;
  const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
  const offer = offers.length === 1 && object(offers[0]) ? offers[0] : null;
  if (!offer || offer.priceCurrency !== 'TRL' || dotMinor(offer.price) !== priceMinor) return null;
  if (offer.url !== undefined && !samePage(offer.url, page)) return null;
  return product.sku;
}

// Exactly one element with the product-price class, holding exactly one current
// (price-sales) amount.
function visiblePriceMinor(html: string): number | null {
  const blocks = [...html.matchAll(/<div\b[^>]*\bclass=(["'])([^"']*)\1[^>]*>/gi)]
    .filter(match => match[2]!.split(/\s+/).includes('product-price'));
  if (blocks.length !== 1 || html.match(/\bclass=(["'])(?:[^"']*\s)?product-price(?:\s[^"']*)?\1/gi)?.length !== 1) return null;
  const block = divBlock(html, blocks[0]!.index!);
  if (!block) return null;
  const amounts = [...block.matchAll(/<(\w+)\b[^>]*\bclass=(["'])(?:[^"']*\s)?price-sales(?:\s[^"']*)?\2[^>]*>([^<]*)<\/\1>/gi)];
  return amounts.length === 1 ? liraMinor(amounts[0]![3]) : null;
}

function divBlock(html: string, start: number): string | null {
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = start;
  let depth = 0;
  for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, tag.index + tag[0].length);
  }
  return null;
}

function samePage(raw: unknown, page: URL): boolean {
  if (typeof raw !== 'string') return false;
  try {
    const actual = new URL(raw, page);
    return actual.hostname.replace(/^www\./, '') === page.hostname.replace(/^www\./, '') &&
      actual.pathname.replace(/\/$/, '') === page.pathname.replace(/\/$/, '');
  } catch {
    return false;
  }
}

// "599.99" as used in structured data.
function dotMinor(value: unknown): number | null {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(raw);
  return match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : null;
}

// "599,99 TL", "1.699,99 TL", "₺599,99": exactly one lira label.
function liraMinor(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/&nbsp;| /g, ' ').trim();
  const match = /^(₺\s*)?(\d{1,3}(?:\.\d{3})+|\d{1,13})(?:,(\d{2}))?\s*(TL|₺)?$/.exec(text);
  if (!match || !match[1] === !match[4]) return null;
  return Number(match[2]!.replace(/\./g, '')) * 100 + Number(match[3] ?? '0');
}
