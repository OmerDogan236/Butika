import { trackingCurrency } from './currency';
import type { Availability } from './availability';

// A WooCommerce variable product publishes two different claims about itself: a
// product-level one in its JSON-LD, and a per-variation one in the add-to-basket
// form's own payload. The product-level claim can say InStock while sizes are
// sold out, because that is what "in stock" means for the product as a whole —
// and it can state an amount the sizes do not.
//
// When an address carries no chosen size, the reader answers with the
// product-level claim. This reads the page's own variation payload only to say
// when that claim must not be treated as verified stock, and when the amount it
// states cannot be trusted either. It never becomes a price or stock source: the
// payload can withhold an answer, never supply one.
//
// The payload counts only where it is bound to the requested product: exactly one
// variations_form whose action is this same page. A recommended product's form
// names another address, and a payload this reader cannot parse is no evidence
// rather than a reason to block the store.
//
// gebematernity.com writes a product page's one variations form without an action
// attribute (four saved product pages, 2026-09-09 … 2026-09-22); such a form submits
// to this same page. On that store alone, and only for a form with no action
// attribute at all, the payload is bound once the page names one product everywhere
// WordPress states one: the body's postid-N, the enclosing #product-N, the shortlink
// ?p=N, the REST link wp/v2/product/N and the form's own add-to-cart and product_id
// fields all equal the form's data-product_id, and the canonical is this page. An
// empty or other action, another product's id, a second variations form or a missing
// piece never binds this way. The parser hands an empty action (action="") back as
// null, like a missing one, so it is the attribute's presence that is checked. The
// product code (SKU) is no product id and is not used.
const ACTIONLESS_FORM_HOST = /^(?:www\.)?gebematernity\.com$/;

export type WooVariationClaim = { priceMajor: number | 'mixed'; inStock: boolean | 'mixed' };
export type WooVerdict = 'mixed_prices' | 'price_mismatch' | 'withhold_stock' | 'keep';

type Variation = { price: number; inStock: boolean };

/** What the bound payload states about every size together, or nothing. */
export function readWooVariationClaim(html: string, rawUrl: string): WooVariationClaim | null {
  let page: URL;
  try { page = new URL(rawUrl); } catch { return null; }
  const payloads = boundPayloads(html, page);
  if (payloads.length !== 1) return null;
  const variations = parseVariations(payloads[0]!);
  if (!variations) return null;
  const prices = new Set(variations.map(v => v.price));
  const stock = new Set(variations.map(v => v.inStock));
  return { priceMajor: prices.size === 1 ? [...prices][0]! : 'mixed', inStock: stock.size === 1 ? [...stock][0]! : 'mixed' };
}

/**
 * The one decision, used wherever this evidence is consulted. The sizes agreeing
 * among themselves does not make them agree with the product-level claim, so both
 * comparisons are made: a contradiction withholds the answer, it never replaces it.
 */
export function wooVariationVerdict(html: string, url: string, priceMinor: number, currency: string,
  availability: Availability | undefined): WooVerdict {
  const claim = readWooVariationClaim(html, url);
  if (!claim) return 'keep';
  if (claim.priceMajor === 'mixed') return 'mixed_prices';
  const stated = minorAmount(claim.priceMajor, currency);
  // An amount this reader cannot place in the tracking model is not price
  // evidence; it neither confirms nor contradicts, and the stock claim still counts.
  if (stated !== null && stated !== priceMinor) return 'price_mismatch';
  if (claim.inStock === 'mixed') return 'withhold_stock';
  const shown = availability ?? 'unknown';
  if (shown !== 'unknown' && shown !== (claim.inStock ? 'in_stock' : 'out_of_stock')) return 'withhold_stock';
  return 'keep';
}

/**
 * Whether the page states its own sizes' stock at all. Where it does, the
 * product-level stock endpoint is not asked: its answer is the very claim this
 * evidence exists to weigh, so it could only put back what was set aside.
 */
export function wooStatesItsOwnSizes(html: string, url: string): boolean {
  return readWooVariationClaim(html, url) !== null;
}

// display_price is written in the currency's main unit and the tracking model
// keeps minor units, so the two only meet in a two-decimal tracking currency.
// Anything else — another scale, a value that does not land on a whole minor
// unit, an amount at or below zero — is left as no evidence.
function minorAmount(major: number, currency: string): number | null {
  if (trackingCurrency(currency) !== currency) return null;
  const scaled = major * 100;
  const minor = Math.round(scaled);
  if (Math.abs(scaled - minor) > 1e-6) return null;
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

type VariationsForm = { action: string | null; hasAction: boolean; payload: string | null; productId: string; within: string[]; addToCart: string[]; productIds: string[] };
// What the page states about its own product: body postid-N, shortlink ?p=N, REST
// link wp/v2/product/N (each read only on this page's own origin) and the canonical.
type PageIds = { postIds: string[]; shortlinks: (string | null)[]; restIds: (string | null)[]; canonicals: string[] };

/**
 * Every variations_form payload whose action names this same page; failing that,
 * the one action-less form of a gebematernity.com product bound by its product ids.
 */
function boundPayloads(html: string, page: URL): string[] {
  const forms: VariationsForm[] = [];
  const ids: PageIds = { postIds: [], shortlinks: [], restIds: [], canonicals: [] };
  const blocks: string[] = [];
  let hidden = 0;
  let open: VariationsForm | null = null;
  new HTMLRewriter().on('*', {
    element(el) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'template' || tag === 'script' || tag === 'style') {
        if (el.canHaveContent) { hidden++; el.onEndTag(() => { hidden--; }); }
        return;
      }
      if (hidden) return;
      const classes = (el.getAttribute('class') ?? '').split(/\s+/);
      const leave: (() => void)[] = [];
      if (tag === 'body') ids.postIds.push(...classes.filter(c => /^postid-\d+$/.test(c)).map(c => c.slice('postid-'.length)));
      if (tag === 'link') {
        const rel = (el.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
        const target = sameOrigin(el.getAttribute('href'), page);
        if (rel.includes('canonical')) ids.canonicals.push(el.getAttribute('href') ?? '');
        if (rel.includes('shortlink')) ids.shortlinks.push(target?.pathname === '/' ? target.searchParams.get('p') : null);
        if (rel.includes('alternate') && (el.getAttribute('type') ?? '').toLowerCase() === 'application/json') {
          ids.restIds.push(target ? /^\/wp-json\/wp\/v2\/product\/(\d+)\/?$/.exec(target.pathname)?.[1] ?? null : null);
        }
      }
      const block = /^product-(\d+)$/.exec(el.getAttribute('id') ?? '')?.[1];
      if (block && el.canHaveContent) { blocks.push(block); leave.push(() => { blocks.pop(); }); }
      if (tag === 'form' && classes.includes('variations_form')) {
        const form: VariationsForm = { action: el.getAttribute('action'), hasAction: el.hasAttribute('action'), payload: el.getAttribute('data-product_variations'),
          productId: (el.getAttribute('data-product_id') ?? '').trim(), within: [...blocks], addToCart: [], productIds: [] };
        forms.push(form);
        if (el.canHaveContent) { open = form; leave.push(() => { open = null; }); }
      } else if (open && (tag === 'input' || tag === 'button')) {
        const value = (el.getAttribute('value') ?? '').trim();
        if (el.getAttribute('name') === 'add-to-cart') open.addToCart.push(value);
        if (el.getAttribute('name') === 'product_id') open.productIds.push(value);
      }
      if (leave.length) el.onEndTag(() => { for (const exit of leave.reverse()) exit(); });
    },
  }).transform(html);
  const found = forms.flatMap(form => form.action !== null && form.payload !== null && namesThisPage(form.action, page) ? [form.payload] : []);
  if (found.length) return found;
  const [only] = forms;
  return forms.length === 1 && only?.payload && actionlessFormOfThisProduct(only, ids, page) ? [only.payload] : [];
}

function actionlessFormOfThisProduct(form: VariationsForm, ids: PageIds, page: URL): boolean {
  if (form.hasAction) return false;
  if (page.protocol !== 'https:' || !ACTIONLESS_FORM_HOST.test(page.hostname) || page.port || page.username || page.password) return false;
  // Equal to the body's postid-N, read as digits only, so no shape check of its own.
  const id = form.productId;
  const all = (values: (string | null)[]) => values.length > 0 && values.every(value => value === id);
  const once = (values: (string | null)[]) => values.length === 1 && all(values);
  const [canonical] = ids.canonicals;
  return once(ids.postIds) && all(form.within) && all(form.addToCart) && all(form.productIds) &&
    once(ids.shortlinks) && once(ids.restIds) && ids.canonicals.length === 1 && canonical !== undefined && namesThisPage(canonical, page);
}

function sameOrigin(href: string | null, page: URL): URL | null {
  if (href === null) return null;
  try {
    const target = new URL(href.replace(/&amp;/g, '&'), page);
    return target.protocol === page.protocol && target.host === page.host ? target : null;
  } catch { return null; }
}

function namesThisPage(action: string, page: URL): boolean {
  try {
    const target = new URL(action, page);
    return target.protocol === page.protocol && target.host === page.host &&
      target.pathname.replace(/\/+$/, '') === page.pathname.replace(/\/+$/, '');
  } catch { return false; }
}

// The parser hands an attribute back as the page wrote it, so the payload still
// carries its character references. `&amp;` is resolved last, or an escaped
// reference would be read as the character it names.
function decodeAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** The payload as WooCommerce writes it: every entry states its price and stock. */
function parseVariations(payload: string): Variation[] | null {
  let data: unknown;
  try { data = JSON.parse(decodeAttribute(payload)); } catch { return null; }
  if (!Array.isArray(data) || !data.length) return null;
  const variations: Variation[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') return null;
    const { display_price: price, is_in_stock: inStock } = entry as Record<string, unknown>;
    if (typeof inStock !== 'boolean') return null;
    const amount = typeof price === 'number' ? price
      : typeof price === 'string' && /^\d+(\.\d+)?$/.test(price) ? Number(price) : null;
    if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
    variations.push({ price: amount, inStock });
  }
  return variations;
}
