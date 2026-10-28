import type { Availability } from './availability';
import { jsonLdBlocks, parseJsonLd } from './json-ld-blocks';

// jimmykey.com product pages (nine saved bodies, 2026-09-09 … 2026-09-22): the product's
// own block is the single `.ProductContent`. It holds the hidden product id (ProductID),
// the colour (hidden ColorID and CurrentColorId, and the active colour link with the same
// colour id, the product id and this page's address), the size list (`.SizeOptions`: a
// size on sale is `a[data-id][data-name][data-stock=True]`, a sold-out size is a
// `span.outer` with a hidden SizeIDs, its label in `span.inner`, a `noStockLine` and a
// "Notify Me" link) and the add-to-bag button with the product code and the amount.
//
// The page's JSON-LD and meta availability is one claim for the whole product. It said
// InStock on four of the nine bodies while some of their sizes were sold out. For an
// address without a chosen size the size list only lets that claim stand or withholds
// it; it never becomes a stock source itself, and one size on sale is not every size on
// sale:
// - another host, or not https (www.)jimmykey.com: untouched;
// - a chosen-size address (_butika_variant): read only as a verified
//   jimmykey:<ProductID>:<ColorID>:<SizeID> (below); any other selection is refused
//   before anything is fetched;
// - an identity the page states that contradicts the address or the rest of the page
//   (canonical, product code, product id, colour, the add-to-bag amount): no reading;
// - a block that cannot be bound (missing, several, pieces outside it) or a size list
//   that is incomplete, repeated or unclear: the price stays, the stock is unknown;
// - every size stated, all in the same state as the product-level claim: the claim stands.
// Modals, recommendation carousels, recently viewed items, the store-stock search, the
// description (mannequin size), the size chart, the sticky add-to-bag bar, the footer and
// <template> content are never the product's block. The breakages tested fail closed; a
// future template is not guaranteed to.
//
// A chosen size, jimmykey:<ProductID>:<ColorID>:<SizeID> (lower case, three positive
// integers, one parameter), is that size's own state on the bound colour page. The
// SizeID alone is the store's size dictionary (71 is S on every product), so the product
// id must be the bound block's and the colour the address's; the store's own add-to-bag,
// stock-warning and notify requests carry the same three ids. The price is the colour
// page's amount (add-to-bag = JSON-LD, as for the page); the product-level claim plays no
// part. A size the page no longer states, a block that cannot be bound or an unclear list
// gives no reading at all, never a product-level price or stock; an identity or amount
// the page contradicts keeps the contradiction rule above. That a size keeps its id when
// it sells out or comes back is assumed, not observed across days.
//
// A colour sold out in every size has no add-to-bag button (white/518 of 6SW187118, fetched
// 2026-09-27): the button's place in the block holds the notify-me link a#NotAdd.RemindMe,
// with the product id and the colour id but no product code, and the block's favourite
// button (button.AddToFavorite) carries the product id (data-id), the code and the amount;
// on the ten saved bodies its id, code and amount are the product id, the address's code
// and the page's price, and on the nine with a button its amount is the button's. Only
// where no add-to-bag button exists anywhere does that link stand in for it: one link,
// naming this product and colour, and one favourite button with a code in the block, whose
// code and amount take the button's part. Every size must then be stated sold out on its
// own; a size on sale beside the link, or a button beside it, leaves the block unbound.
const HOST = /^(?:www\.)?jimmykey\.com$/;
// /{language}/{slug}_{product code}/{colour slug}/{colour id}
const ADDRESS = /^\/[a-z]{2}\/[^/]+_([0-9a-z]+)\/[^/]+\/(\d+)$/i;
const ELSEWHERE_TAGS = ['template', 'footer'];
const ELSEWHERE_CLASSES = ['modal', 'personaclick-recommend', 'recommended-items', 'AutoGetLastVisited', 'SuggestAndLast',
  'CombineItems', 'AddToBasketFixed', 'StoreStock', 'SizeTable'];
const ELSEWHERE_IDS = ['PrdInfo'];

export type JimmykeySize = { id: string; label: string; onSale: boolean };
export type JimmykeyChoice =
  | { kind: 'other_host' }
  | { kind: 'selection_address' }
  | { kind: 'conflict'; reason: string }
  | { kind: 'unbound'; reason: string }
  | { kind: 'bound'; amountMinor: number; productId: string; sizes: JimmykeySize[] | null; unclear: string | null };

type SoldOut = { kind: 'sold_out'; ids: string[]; label: string; inners: number; lines: number; notify: number };
type Entry = { kind: 'link'; id: string | null; label: string | null; stock: string | null } | SoldOut;
type Scan = {
  blocks: number; strays: string[]; productIds: string[]; colourIds: string[]; currentColourIds: string[];
  actives: { id: string | null; productId: string | null; href: string | null }[];
  lists: number; entries: Entry[]; baskets: { code: string | null; amount: string | null }[];
  notifies: { tag: string; remindMe: boolean; productId: string | null; colourId: string | null }[];
  favourites: { tag: string; id: string | null; code: string; amount: string | null }[];
  canonicals: string[]; pageIds: string[];
};

function jimmykeyPage(url: string): URL | null {
  let page: URL;
  try { page = new URL(url); } catch { return null; }
  return page.protocol === 'https:' && HOST.test(page.hostname) && !page.port && !page.username && !page.password ? page : null;
}

/** The stock of a jimmykey address is decided by jimmykeyChoice alone; nothing may fill it in later. */
export const isJimmykeyAddress = (url: string) => jimmykeyPage(url) !== null;

const SELECTION = /^jimmykey:([1-9][0-9]{0,9}):([1-9][0-9]{0,9}):([1-9][0-9]{0,9})$/;

/**
 * A jimmykey:<ProductID>:<ColorID>:<SizeID> selection, or null where the address carries
 * none. Anything but one such value on an https (www.)jimmykey.com colour address whose
 * colour is the selection's leaves the ids empty: an identity that cannot be read.
 */
export function readJimmykeySelection(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  const values = url.searchParams.getAll('_butika_variant');
  if (!values.some(value => value.startsWith('jimmykey:'))) return null;
  const page = jimmykeyPage(raw);
  const own = page ? identity(page.href, page) : null;
  const address = own === null ? null : ADDRESS.exec(own.slice(own.indexOf('/')));
  const match = values.length === 1 && address ? SELECTION.exec(values[0] ?? '') : null;
  const ids = match && match[2] === address?.[2] ? match : null;
  url.searchParams.delete('_butika_variant');
  return { sourceUrl: url.toString(), productId: ids?.[1] ?? '', colourId: ids?.[2] ?? '', variantId: ids?.[3] ?? '' };
}

/** A chosen-size jimmykey address that is not a readable jimmykey selection: nothing is read. */
export function isJimmykeySelection(url: string): boolean {
  if (!jimmykeyPage(url)?.searchParams.has('_butika_variant')) return false;
  return !readJimmykeySelection(url)?.variantId;
}

export function jimmykeyChoice(html: string, url: string): JimmykeyChoice {
  const page = jimmykeyPage(url);
  if (!page) return { kind: 'other_host' };
  if (page.searchParams.has('_butika_variant')) return { kind: 'selection_address' };
  const own = identity(page.href, page);
  const address = own === null ? null : ADDRESS.exec(own.slice(own.indexOf('/')));
  if (!address) return { kind: 'unbound', reason: 'the address names no product code and colour' };
  const [, code, colour] = address as unknown as [string, string, string];
  const s = scan(html);
  if (s.blocks !== 1) return { kind: 'unbound', reason: s.blocks ? 'several product blocks' : 'no product block' };
  if (s.strays.length) return { kind: 'unbound', reason: `${s.strays[0]} outside the product block` };

  // What the page states about itself must not contradict the address or itself. Without an
  // add-to-bag button, the notify-me link and the favourite button state it too.
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const products = schemaProducts(html);
  const notifyOnly = !s.baskets.length && s.notifies.length > 0;
  const notifies = notifyOnly ? s.notifies : [];
  const favourites = notifyOnly ? s.favourites : [];
  const conflicts = [
    s.canonicals.some(href => identity(href, page) !== own) && 'canonical',
    products.some(p => p.sku !== null && !same(p.sku, code)) && 'schema product code',
    products.some(p => p.offerUrls.some(href => identity(href, page) !== own)) && 'schema offer address',
    new Set([...s.productIds, ...s.actives.map(a => a.productId ?? ''), ...s.pageIds, ...notifies.map(n => n.productId ?? ''),
      ...favourites.map(f => f.id ?? '')].filter(Boolean)).size > 1 && 'product id',
    [...s.colourIds, ...s.currentColourIds, ...s.actives.map(a => a.id ?? ''), ...notifies.map(n => n.colourId ?? '')]
      .some(id => id && id !== colour) && 'colour',
    s.actives.some(a => a.href !== null && identity(a.href, page) !== own) && 'colour address',
    s.baskets.some(b => b.code !== null && !same(b.code, code)) && 'add-to-bag product code',
    favourites.some(f => !same(f.code, code)) && 'favourite product code',
  ].filter((reason): reason is string => typeof reason === 'string');
  if (conflicts.length) return { kind: 'conflict', reason: conflicts.join(', ') };

  // What must be there, once each.
  const unbound = (reason: string): JimmykeyChoice => ({ kind: 'unbound', reason });
  const once = <T>(values: T[]) => values.length === 1 ? values[0] : undefined;
  if (s.canonicals.length !== 1) return unbound('canonical');
  if (!once(products)?.sku) return unbound('schema product');
  if (!/^\d+$/.test(once(s.productIds) ?? '')) return unbound('product id');
  if (s.colourIds.length !== 1) return unbound('colour id');
  const active = once(s.actives);
  if (!active?.id || !active.productId || active.href === null) return unbound('active colour');
  // The add-to-bag button gives the amount; on a colour sold out in every size, where there
  // is none, the one notify-me link and the favourite button with the code do.
  let amount: string | null;
  if (!notifyOnly) {
    const basket = once(s.baskets);
    if (!basket?.code) return unbound('add-to-bag button');
    if (s.notifies.length) return unbound('add-to-bag button beside a notify-me link');
    amount = basket.amount;
  } else {
    const notify = once(s.notifies);
    if (notify?.tag !== 'a' || !notify.remindMe || !notify.productId || !notify.colourId) return unbound('notify-me link');
    const favourite = once(s.favourites);
    if (favourite?.tag !== 'button' || !favourite.id) return unbound('favourite button');
    amount = favourite.amount;
  }
  const amountMinor = minor(amount);
  if (amountMinor === null) return unbound(notifyOnly ? 'favourite amount' : 'add-to-bag amount');
  if (s.lists !== 1) return unbound(s.lists ? 'several size lists' : 'no size list');
  const read = readSizes(s.entries);
  // The link says the colour cannot be bought; a size it does not cover is a contradiction,
  // and the link itself is never any size's stock.
  if (notifyOnly && read.sizes?.some(size => size.onSale)) return unbound('a size on sale beside the notify-me link');
  return { kind: 'bound', amountMinor, productId: s.productIds[0] ?? '', ...read };
}

/**
 * The stock a jimmykey product page may state for an address without a chosen size: the
 * product-level claim when every size is stated and all of them agree with it, else unknown.
 */
export function jimmykeyStock(sizes: JimmykeySize[] | null, claim: Availability): Availability {
  if (!sizes || claim === 'unknown') return 'unknown';
  return sizes.every(size => size.onSale === (claim === 'in_stock')) ? claim : 'unknown';
}

export type JimmykeySelectedSize = { availability: 'in_stock' | 'out_of_stock' } | { rejected: string; contradiction?: true };

/**
 * The chosen size's own state on its colour page. base: the page's product price, read
 * without the selection; the add-to-bag amount must be that price. The colour is bound
 * twice before this: the selection's to the address (readJimmykeySelection) and the
 * page's to the address (jimmykeyChoice).
 */
export function jimmykeySelectedSize(html: string, url: string, base: { priceMinor: number }): JimmykeySelectedSize {
  const selection = readJimmykeySelection(url);
  if (!selection?.variantId) return { rejected: 'invalid identity' };
  const choice = jimmykeyChoice(html, selection.sourceUrl);
  if (choice.kind === 'conflict') return { rejected: `page does not match the requested product: ${choice.reason}`, contradiction: true };
  if (choice.kind !== 'bound') return { rejected: choice.kind === 'unbound' ? `product block: ${choice.reason}` : 'invalid identity' };
  if (choice.amountMinor !== base.priceMinor) return { rejected: 'add-to-bag amount differs from the product price', contradiction: true };
  if (choice.productId !== selection.productId) return { rejected: 'product identity' };
  if (!choice.sizes) return { rejected: `size list: ${choice.unclear}` };
  const size = choice.sizes.find(entry => entry.id === selection.variantId);
  if (!size) return { rejected: 'size not on page' };
  return { availability: size.onSale ? 'in_stock' : 'out_of_stock' };
}

function readSizes(entries: Entry[]): { sizes: JimmykeySize[] | null; unclear: string | null } {
  const sizes: JimmykeySize[] = [];
  for (const entry of entries) {
    if (entry.kind === 'link') {
      const stock = (entry.stock ?? '').toLowerCase();
      if (!entry.id || !/^\d+$/.test(entry.id) || !label(entry.label) || (stock !== 'true' && stock !== 'false')) {
        return { sizes: null, unclear: 'a size link without its id, label or stock' };
      }
      sizes.push({ id: entry.id, label: label(entry.label), onSale: stock === 'true' });
    } else {
      const [id] = entry.ids;
      if (entry.ids.length !== 1 || !id || !/^\d+$/.test(id) || entry.inners !== 1 || !label(entry.label) || !entry.lines || !entry.notify) {
        return { sizes: null, unclear: 'a sold-out size without its id, label or sold-out marks' };
      }
      sizes.push({ id, label: label(entry.label), onSale: false });
    }
  }
  if (!sizes.length) return { sizes: null, unclear: 'no size' };
  if (new Set(sizes.map(size => size.id)).size !== sizes.length) return { sizes: null, unclear: 'a size id repeated' };
  if (new Set(sizes.map(size => size.label.toLowerCase())).size !== sizes.length) return { sizes: null, unclear: 'a size label repeated' };
  return { sizes, unclear: null };
}

// Attribute values and text chunks arrive as the page wrote them.
const label = (value: string | null) => (value ?? '').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();

// "699.95" → 69995; anything else is no amount.
function minor(amount: string | null): number | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec((amount ?? '').trim());
  if (!match) return null;
  const value = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return value > 0 ? value : null;
}

// Host without www and decoded path without a trailing slash, lower case; the query is
// no part of the product (recommendation links carry tracking parameters).
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
  const s: Scan = { blocks: 0, strays: [], productIds: [], colourIds: [], currentColourIds: [], actives: [], lists: 0, entries: [],
    baskets: [], notifies: [], favourites: [], canonicals: [], pageIds: [] };
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
        if (ELSEWHERE_TAGS.includes(tag) || ELSEWHERE_IDS.includes(id) || classes.some(c => ELSEWHERE_CLASSES.includes(c))) {
          scope(() => { elsewhere++; }, () => { elsewhere--; });
        } else if (!elsewhere) {
          const value = (el.getAttribute('value') ?? '').trim();
          if (tag === 'link' && (el.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).includes('canonical')) s.canonicals.push(el.getAttribute('href') ?? '');
          if (classes.includes('ProductContent')) { s.blocks++; scope(() => { block++; }, () => { block--; }); }
          if (block) {
            if (tag === 'input' && id === 'ProductID') s.productIds.push(value);
            if (tag === 'input' && id === 'ColorID') s.colourIds.push(value);
            if (tag === 'input' && id === 'CurrentColorId') s.currentColourIds.push(value);
            if (classes.includes('ColorOptionItem') && classes.includes('active')) scope(() => { active++; }, () => { active--; });
            if (active && tag === 'a' && classes.includes('change-color')) {
              s.actives.push({ id: el.getAttribute('data-id'), productId: el.getAttribute('data-productid'), href: el.getAttribute('href') });
            }
            if (classes.includes('SizeOptions')) { s.lists++; scope(() => { list++; }, () => { list--; }); }
            if (list && tag === 'span' && classes.includes('outer')) {
              const own: SoldOut = { kind: 'sold_out', ids: [], label: '', inners: 0, lines: 0, notify: 0 };
              s.entries.push(own);
              scope(() => { soldOut = own; }, () => { if (soldOut === own) soldOut = null; });
            } else if (list && soldOut) {
              const open: SoldOut = soldOut;
              if (tag === 'input' && el.getAttribute('name') === 'SizeIDs') open.ids.push(value);
              if (tag === 'span' && classes.includes('inner')) { open.inners++; scope(() => { inner = open; }, () => { inner = null; }); }
              if (tag === 'span' && classes.includes('noStockLine')) open.lines++;
              if (tag === 'a' && classes.includes('NotifyWhen')) open.notify++;
            } else if (list && tag === 'a') {
              s.entries.push({ kind: 'link', id: el.getAttribute('data-id'), label: el.getAttribute('data-name'), stock: el.getAttribute('data-stock') });
            }
            if (tag === 'button' && id === 'Basket') s.baskets.push({ code: el.getAttribute('data-productcode'), amount: el.getAttribute('data-amount') });
            if (id === 'NotAdd') {
              s.notifies.push({ tag, remindMe: classes.includes('RemindMe'), productId: el.getAttribute('data-productid'), colourId: el.getAttribute('data-colorid') });
            }
            const favouriteCode = classes.includes('AddToFavorite') ? el.getAttribute('data-productcode') : null;
            if (favouriteCode !== null) s.favourites.push({ tag, id: el.getAttribute('data-id'), code: favouriteCode, amount: el.getAttribute('data-amount') });
          } else {
            // The same pieces anywhere else on the page belong to no block we can tie.
            if (classes.includes('SizeOptions')) s.strays.push('a size list');
            if (tag === 'button' && id === 'Basket') s.strays.push('an add-to-bag button');
            if (id === 'NotAdd') s.strays.push('a notify-me link');
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
