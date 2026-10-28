import { jsonLdBlocks, parseJsonLd } from './json-ld-blocks';

// Lutvelizade states each size's stock on the product page itself. The product
// block (div.details) lists every size: a selectable one carries its GUID in
// data-id, a sold-out one is class="disable" without an id. The "Gelince Haber
// Ver" dialog (#addStockNotificationModal) lists the sold-out sizes with their
// GUIDs; the store's own script sends that GUID, and nothing else about the
// product, as ProductPriorityVariationVariationId. A saved size is
// lutvelizade:<ppv>:<size GUID>, ppv being the product block's own data-ppv-id.
//
// The answer is the page's claim, not a warehouse count, and it is given only when
// the page states it once and consistently: one product block with this ppv, its
// product code equal to the page's single JSON-LD product, that product's single
// offer at this address and at the displayed price, and one reading of the sizes.
// No such page, no answer: never a product-level stock, never a price for a size
// the page does not show. That a size keeps its GUID when it sells out or comes
// back is assumed, not observed: a GUID the page no longer shows is unknown, not
// sold out.

const HOST = /^(?:www\.)?lutvelizade\.com\.tr$/;
const UUID = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const GUID = new RegExp(`^${UUID}$`);
const IDENTITY = new RegExp(`^lutvelizade:(${UUID}):(${UUID})$`);

export function readLutvelizadeSelection(raw: string) {
  const url = new URL(raw), values = url.searchParams.getAll('_butika_variant');
  if (!values.some(v => v.startsWith('lutvelizade:'))) return null;
  const match = values.length === 1 && url.protocol === 'https:' && HOST.test(url.hostname) && !url.port && !url.username && !url.password
    ? IDENTITY.exec(values[0]!) : null;
  url.searchParams.delete('_butika_variant');
  return { sourceUrl: url.toString(), productId: match?.[1] ?? '', variantId: match?.[2] ?? '' };
}

type Size = { label: string; id: string | null; disabled: boolean };
type Page = {
  details: number; ppv: string[]; codes: string[]; prices: { classes: string[]; text: string }[];
  mainLists: number; main: Size[]; dialogs: number; dialogLists: number; dialog: Size[]; open: number;
};

// Bun's HTML parser, scoped to the product block and the dialog: a recommended
// product's card or a second block elsewhere on the page is never this product.
function readPage(html: string): Page {
  const page: Page = { details: 0, ppv: [], codes: [], prices: [], mainLists: 0, main: [], dialogs: 0, dialogLists: 0, dialog: [], open: 0 };
  let templateDepth = 0;
  const classes = (el: HTMLRewriterTypes.Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  // Text of one element at a time; an element never closed leaves page.open above
  // zero. Attributes are taken when the element opens: the element object is only
  // valid inside that handler.
  const texts = new Map<string, { value: string }>();
  const captured = <T>(key: string, start: (el: HTMLRewriterTypes.Element) => T, done: (value: T, text: string) => void): HTMLRewriterTypes.HTMLRewriterElementContentHandlers => ({
    element(el) {
      if (templateDepth) return;
      page.open++;
      // No end tag, no text: the element stays open and the page gets no reading.
      if (!el.canHaveContent) return;
      const value = start(el), text = { value: '' };
      texts.set(key, text);
      el.onEndTag(() => { page.open--; texts.delete(key); done(value, text.value.replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ').trim()); });
    },
    text(chunk) { const text = texts.get(key); if (text && !templateDepth) text.value += chunk.text; },
  });
  const size = (list: Size[]) => captured(list === page.main ? 'main' : 'dialog',
    el => ({ id: el.getAttribute('data-id'), disabled: classes(el).includes('disable') }), (value, label) => list.push({ label, ...value }));
  new HTMLRewriter()
    .on('template', { element(el) { templateDepth++; el.onEndTag(() => { templateDepth--; }); } })
    .on('div.details', { element() { if (!templateDepth) page.details++; } })
    .on('div.details [data-ppv-id]', { element(el) { if (!templateDepth) page.ppv.push(el.getAttribute('data-ppv-id') ?? ''); } })
    .on('div.details .product-code span', captured('code', () => null, (_, text) => page.codes.push(text)))
    .on('div.details span.price', captured('price', classes, (value, text) => page.prices.push({ classes: value, text })))
    .on('div.details .variation.size', { element() { if (!templateDepth) page.mainLists++; } })
    .on('div.details .variation.size a', size(page.main))
    .on('#addStockNotificationModal', { element() { if (!templateDepth) page.dialogs++; } })
    .on('#addStockNotificationModal .variation.size', { element() { if (!templateDepth) page.dialogLists++; } })
    .on('#addStockNotificationModal .variation.size a', size(page.dialog))
    .transform(html);
  return page;
}

// The page's JSON-LD products, nested ones included. A block that does not parse
// could hide another product, so it leaves the page without a reading.
function jsonLdProducts(html: string): Record<string, unknown>[] | null {
  const products: Record<string, unknown>[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>, type = node['@type'];
    if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) products.push(node);
    Object.values(node).forEach(walk);
  };
  for (const block of jsonLdBlocks(html)) {
    const data = parseJsonLd(block);
    if (data === undefined) return null;
    walk(data);
  }
  return products;
}

// 599.96 or "599.96": the offer's amount in kuruş, nothing rounded away.
function offerMinor(value: unknown): number | null {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text);
  return match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : null;
}

// "1.499,90 TL" as the product block shows it.
function displayedMinor(text: string): number | null {
  const match = /^(\d{1,3}(?:\.\d{3})+|\d{1,9}),(\d{2}) TL$/.exec(text);
  return match ? Number(match[1]!.replaceAll('.', '')) * 100 + Number(match[2]) : null;
}

export type LutvelizadeSize = { availability: 'in_stock' | 'out_of_stock' } | { rejected: string };

// base: the page's own product price, read without the selection.
export function lutvelizadeSelectedSize(html: string, url: string, base: { priceMinor: number; currency: string }): LutvelizadeSize {
  const selection = readLutvelizadeSelection(url);
  if (!selection?.variantId) return { rejected: 'invalid identity' };
  const source = new URL(selection.sourceUrl);
  const page = readPage(html);
  if (page.open !== 0) return { rejected: 'incomplete page' };
  if (page.details !== 1) return { rejected: 'product block' };
  if (page.ppv.length !== 1 || page.ppv[0] !== selection.productId) return { rejected: 'product identity' };
  if (page.codes.length !== 1 || !page.codes[0]) return { rejected: 'product code' };

  const products = jsonLdProducts(html);
  if (!products || products.length !== 1) return { rejected: 'structured product' };
  const product = products[0]!, offers = Array.isArray(product.offers) ? product.offers : [product.offers];
  const offer = offers.length === 1 && offers[0] && typeof offers[0] === 'object' ? offers[0] as Record<string, unknown> : null;
  const here = (raw: unknown) => {
    if (typeof raw !== 'string') return false;
    try {
      const u = new URL(raw, source);
      return u.protocol === 'https:' && !u.port && !u.search && u.hostname.replace(/^www\./, '') === source.hostname.replace(/^www\./, '') &&
        decodeURIComponent(u.pathname).replace(/\/$/, '') === decodeURIComponent(source.pathname).replace(/\/$/, '');
    } catch { return false; }
  };
  if (product.sku !== page.codes[0] || !offer || offer['@type'] !== 'Offer' || !here(offer.url) || (product.url !== undefined && !here(product.url))) {
    return { rejected: 'structured product' };
  }

  // The offer, the displayed price and the product's own price must be one amount.
  const current = page.prices.filter(p => p.classes.includes('discounted'));
  const shown = current.length ? current : page.prices.filter(p => !p.classes.includes('invalid'));
  const amount = offerMinor(offer.price);
  if (offer.priceCurrency !== 'TRY' || base.currency !== 'TRY' || amount === null || amount !== base.priceMinor ||
    shown.length !== 1 || displayedMinor(shown[0]!.text) !== amount) return { rejected: 'price' };

  // One reading of the sizes: every label once per list, a selectable size with its
  // own GUID, a sold-out size without one in the block and with exactly one GUID in
  // the dialog, and no GUID in both.
  const { main, dialog } = page;
  const labels = (list: Size[]) => new Set(list.map(s => s.label));
  const soldOut = main.filter(s => s.disabled);
  const ids = [...main.filter(s => !s.disabled).map(s => s.id), ...dialog.map(s => s.id)];
  if (page.mainLists !== 1 || !main.length || page.dialogs > 1 || page.dialogLists !== page.dialogs ||
    main.some(s => !s.label || (s.disabled ? s.id !== null : !GUID.test(s.id ?? ''))) ||
    dialog.some(s => !s.label || s.disabled || !GUID.test(s.id ?? '')) ||
    labels(main).size !== main.length || labels(dialog).size !== dialog.length || new Set(ids).size !== ids.length ||
    dialog.length !== soldOut.length || soldOut.some(s => !labels(dialog).has(s.label))) return { rejected: 'size lists' };

  if (main.some(s => !s.disabled && s.id === selection.variantId)) return { availability: 'in_stock' };
  if (dialog.some(s => s.id === selection.variantId)) return { availability: 'out_of_stock' };
  return { rejected: 'size not on page' };
}
