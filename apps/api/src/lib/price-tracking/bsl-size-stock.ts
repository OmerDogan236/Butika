import type { Availability } from './availability';
import { jsonLdBlocks, parseJsonLd } from './json-ld-blocks';

// www.bsl.com.tr product pages (one saved body: midi skirt 21048-175, 2026-09-09). The
// storefront shares its vendor's block names with jimmykey.com, but not its template:
// the address ends in {product code}-{colour id}, the JSON-LD sku is that same pair, the
// active colour link has no address, the add-to-bag button states the product id and a
// comma-decimal amount, and a sold-out size carries no noStockLine. So this is a guard of
// its own, bound to this host and this template only (jimmykey-size-stock.ts is separate).
//
// The product's own block is the single `.ProductContent`: the hidden ProductID and
// ColorID, the active colour (`.ColorOptionItem.active a` with data-id and
// data-productid), the size list (`.SizeOptions`: a size on sale is
// `a[data-id][data-name][data-stock=True]`, a sold-out size is a `span.outer` with one
// hidden SizeIDs, a "Stoğa Gelince Haber Ver" NotifyWhen link and its label in
// `span.inner`) and the add-to-bag button. The page's JSON-LD availability is one claim
// for the whole product; the size list only lets it stand or withholds it:
// - another host, or not https (www.)bsl.com.tr: untouched;
// - a chosen-size address (_butika_variant): no size identity of ours exists for this
//   store, so nothing is read;
// - an identity the page states that contradicts the address or the rest of the page
//   (canonical, JSON-LD sku or offer address, product id, colour, product code, the
//   add-to-bag amount): no reading;
// - a block that cannot be bound or a size list that is incomplete, repeated or unclear:
//   the price stays, the stock is unknown;
// - every size stated, all in the same state as the product-level claim: it stands.
// Modals, suggested and recently viewed products, the size chart, the footer and
// <template> content are never the product's block. The breakages tested fail closed; a
// template this one page does not show is not guaranteed to.
const HOST = /^(?:www\.)?bsl\.com\.tr$/;
// /{language}/{slug}_{product code}-{colour id}
const ADDRESS = /^\/[a-z]{2}\/[^/]+_(\d+)-(\d+)$/i;
const ELSEWHERE_TAGS = ['template', 'footer'];
const ELSEWHERE_CLASSES = ['modal', 'SuggestedProductsContainer', 'AutoGetLastVisited', 'find-table-size', 'SizeTableArea', 'SizeTable'];

export type BslSize = { id: string; label: string; onSale: boolean };
export type BslChoice =
  | { kind: 'other_host' }
  | { kind: 'selection_address' }
  | { kind: 'conflict'; reason: string }
  | { kind: 'unbound'; reason: string }
  | { kind: 'bound'; amountMinor: number; sizes: BslSize[] | null; unclear: string | null };

type SoldOut = { kind: 'sold_out'; ids: string[]; label: string; inners: number; notify: number };
type Entry = { kind: 'link'; id: string | null; label: string | null; stock: string | null } | SoldOut;
type Scan = {
  blocks: number; strays: string[]; productIds: string[]; colourIds: string[];
  actives: { id: string | null; productId: string | null }[];
  lists: number; entries: Entry[]; baskets: { code: string | null; productId: string | null; amount: string | null }[];
  canonicals: string[]; pageIds: string[];
};

function bslPage(url: string): URL | null {
  let page: URL;
  try { page = new URL(url); } catch { return null; }
  return page.protocol === 'https:' && HOST.test(page.hostname) && !page.port && !page.username && !page.password ? page : null;
}

/** The stock of a BSL address is decided by bslChoice alone; nothing may fill it in later. */
export const isBslAddress = (url: string) => bslPage(url) !== null;

/** A chosen-size BSL address: no size identity exists for this store, so none is read. */
export function isBslSelection(url: string): boolean {
  return bslPage(url)?.searchParams.has('_butika_variant') ?? false;
}

export function bslChoice(html: string, url: string): BslChoice {
  const page = bslPage(url);
  if (!page) return { kind: 'other_host' };
  if (page.searchParams.has('_butika_variant')) return { kind: 'selection_address' };
  const own = identity(page.href, page);
  const address = own === null ? null : ADDRESS.exec(own.slice(own.indexOf('/')));
  if (!address) return { kind: 'unbound', reason: 'the address names no product code and colour' };
  const [, code, colour] = address as unknown as [string, string, string];
  const s = scan(html);
  if (s.blocks !== 1) return { kind: 'unbound', reason: s.blocks ? 'several product blocks' : 'no product block' };
  if (s.strays.length) return { kind: 'unbound', reason: `${s.strays[0]} outside the product block` };

  // What the page states about itself must not contradict the address or itself.
  const products = schemaProducts(html);
  const conflicts = [
    s.canonicals.some(href => identity(href, page) !== own) && 'canonical',
    products.some(p => p.sku !== null && p.sku.toLowerCase() !== `${code}-${colour}`) && 'schema sku',
    products.some(p => p.offerUrls.some(href => identity(href, page) !== own)) && 'schema offer address',
    new Set([...s.productIds, ...s.actives.map(a => a.productId ?? ''), ...s.baskets.map(b => b.productId ?? ''), ...s.pageIds].filter(Boolean)).size > 1
      && 'product id',
    [...s.colourIds, ...s.actives.map(a => a.id ?? '')].some(id => id && id !== colour) && 'colour',
    s.baskets.some(b => b.code !== null && b.code !== code) && 'add-to-bag product code',
  ].filter((reason): reason is string => typeof reason === 'string');
  if (conflicts.length) return { kind: 'conflict', reason: conflicts.join(', ') };

  // What must be there, once each.
  const unbound = (reason: string): BslChoice => ({ kind: 'unbound', reason });
  const once = <T>(values: T[]) => values.length === 1 ? values[0] : undefined;
  if (s.canonicals.length !== 1) return unbound('canonical');
  if (!once(products)?.sku) return unbound('schema product');
  if (!/^\d+$/.test(once(s.productIds) ?? '')) return unbound('product id');
  if (s.colourIds.length !== 1) return unbound('colour id');
  const active = once(s.actives);
  if (!active?.id || !active.productId) return unbound('active colour');
  const basket = once(s.baskets);
  if (!basket?.code || !basket.productId) return unbound('add-to-bag button');
  const amountMinor = minor(basket.amount);
  if (amountMinor === null) return unbound('add-to-bag amount');
  if (s.lists !== 1) return unbound(s.lists ? 'several size lists' : 'no size list');
  return { kind: 'bound', amountMinor, ...readSizes(s.entries) };
}

/**
 * The stock a BSL product page may state for an address without a chosen size: the
 * product-level claim when every size is stated and all of them agree with it, else unknown.
 */
export function bslStock(sizes: BslSize[] | null, claim: Availability): Availability {
  if (!sizes || claim === 'unknown') return 'unknown';
  return sizes.every(size => size.onSale === (claim === 'in_stock')) ? claim : 'unknown';
}

function readSizes(entries: Entry[]): { sizes: BslSize[] | null; unclear: string | null } {
  const sizes: BslSize[] = [];
  for (const entry of entries) {
    if (entry.kind === 'link') {
      const stock = (entry.stock ?? '').toLowerCase();
      if (!entry.id || !/^\d+$/.test(entry.id) || !label(entry.label) || (stock !== 'true' && stock !== 'false')) {
        return { sizes: null, unclear: 'a size link without its id, label or stock' };
      }
      sizes.push({ id: entry.id, label: label(entry.label), onSale: stock === 'true' });
    } else {
      const [id] = entry.ids;
      if (entry.ids.length !== 1 || !id || !/^\d+$/.test(id) || entry.inners !== 1 || !label(entry.label) || !entry.notify) {
        return { sizes: null, unclear: 'a sold-out size without its id, label or notify link' };
      }
      sizes.push({ id, label: label(entry.label), onSale: false });
    }
  }
  if (!sizes.length) return { sizes: null, unclear: 'no size' };
  if (new Set(sizes.map(size => size.id)).size !== sizes.length) return { sizes: null, unclear: 'a size id repeated' };
  if (new Set(sizes.map(size => size.label.toLowerCase())).size !== sizes.length) return { sizes: null, unclear: 'a size label repeated' };
  return { sizes, unclear: null };
}

// Attribute values and text chunks arrive as the page wrote them ("&nbsp;&nbsp;L&nbsp;&nbsp;").
const label = (value: string | null) => (value ?? '').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();

// "1149,99" → 114999, the way the button writes it; anything else is no amount.
function minor(amount: string | null): number | null {
  const match = /^(\d{1,9})(?:,(\d{1,2}))?$/.exec((amount ?? '').trim());
  if (!match) return null;
  const value = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return value > 0 ? value : null;
}

// Host without www and decoded path without a trailing slash, lower case; the query is no
// part of the product.
function identity(href: string, page: URL): string | null {
  try {
    const target = new URL(href.replace(/&amp;/g, '&'), page);
    if (target.protocol !== 'https:' || target.port || target.username || target.password) return null;
    return `${target.hostname.replace(/^www\./, '')}${decodeURIComponent(target.pathname).replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return null;
  }
}

function scan(html: string): Scan {
  const s: Scan = { blocks: 0, strays: [], productIds: [], colourIds: [], actives: [], lists: 0, entries: [], baskets: [], canonicals: [], pageIds: [] };
  let elsewhere = 0;
  let block = 0;
  let active = 0;
  let list = 0;
  let soldOut: SoldOut | null = null;
  let inner: SoldOut | null = null;
  new HTMLRewriter()
    .on('*', {
      element(el) {
        const tag = el.tagName.toLowerCase();
        const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
        const id = el.getAttribute('id') ?? '';
        const leave: (() => void)[] = [];
        // One end-tag handler per element; a block never closed keeps its scope to the end.
        const scope = (enter: () => void, exit: () => void) => { if (el.canHaveContent) { enter(); leave.push(exit); } };
        if (ELSEWHERE_TAGS.includes(tag) || classes.some(c => ELSEWHERE_CLASSES.includes(c))) {
          scope(() => { elsewhere++; }, () => { elsewhere--; });
        } else if (!elsewhere) {
          const value = (el.getAttribute('value') ?? '').trim();
          if (tag === 'link' && (el.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).includes('canonical')) s.canonicals.push(el.getAttribute('href') ?? '');
          if (classes.includes('ProductContent')) { s.blocks++; scope(() => { block++; }, () => { block--; }); }
          if (block) {
            if (tag === 'input' && id === 'ProductID') s.productIds.push(value);
            if (tag === 'input' && id === 'ColorID') s.colourIds.push(value);
            if (classes.includes('ColorOptionItem') && classes.includes('active')) scope(() => { active++; }, () => { active--; });
            if (active && tag === 'a') s.actives.push({ id: el.getAttribute('data-id'), productId: el.getAttribute('data-productid') });
            if (classes.includes('SizeOptions')) { s.lists++; scope(() => { list++; }, () => { list--; }); }
            if (list && tag === 'span' && classes.includes('outer')) {
              const own: SoldOut = { kind: 'sold_out', ids: [], label: '', inners: 0, notify: 0 };
              s.entries.push(own);
              scope(() => { soldOut = own; }, () => { if (soldOut === own) soldOut = null; });
            } else if (list && soldOut) {
              const open: SoldOut = soldOut;
              if (tag === 'input' && el.getAttribute('name') === 'SizeIDs') open.ids.push(value);
              if (tag === 'span' && classes.includes('inner')) { open.inners++; scope(() => { inner = open; }, () => { inner = null; }); }
              if (tag === 'a' && classes.includes('NotifyWhen')) open.notify++;
            } else if (list && tag === 'a') {
              s.entries.push({ kind: 'link', id: el.getAttribute('data-id'), label: el.getAttribute('data-name'), stock: el.getAttribute('data-stock') });
            }
            if (tag === 'button' && id === 'Basket') {
              s.baskets.push({ code: el.getAttribute('data-productcode'), productId: el.getAttribute('data-productid'), amount: el.getAttribute('data-productamount') });
            }
          } else {
            // The same pieces anywhere else on the page belong to no block we can tie.
            if (classes.includes('SizeOptions')) s.strays.push('a size list');
            if (tag === 'button' && id === 'Basket') s.strays.push('an add-to-bag button');
            if (tag === 'input' && id === 'ProductID') s.strays.push('a product id');
            if (tag === 'input' && id === 'PID') s.pageIds.push(value);
          }
        }
        if (leave.length) el.onEndTag(() => { for (const exit of leave.reverse()) exit(); });
      },
    })
    .onDocument({ text(chunk) { if (inner) inner.label += chunk.text; } })
    .transform(html);
  return s;
}

type SchemaProduct = { sku: string | null; offerUrls: string[] };

// The page's own Product nodes (top level and @graph). Unreadable JSON-LD states nothing.
function schemaProducts(html: string): SchemaProduct[] {
  const products: SchemaProduct[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    const types = [node['@type']].flat();
    if (types.includes('Product') || types.includes('ProductGroup')) {
      const sku = typeof node.sku === 'string' || typeof node.sku === 'number' ? String(node.sku).trim() : '';
      const offers = [node.offers].flat().filter((o): o is Record<string, unknown> => !!o && typeof o === 'object');
      products.push({ sku: sku || null, offerUrls: offers.map(o => o.url).filter((u): u is string => typeof u === 'string') });
    }
    if (node['@graph']) walk(node['@graph']);
  };
  for (const block of jsonLdBlocks(html)) walk(parseJsonLd(block));
  return products;
}
