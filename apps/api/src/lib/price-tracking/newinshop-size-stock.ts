import { jsonLdBlocks, parseJsonLd, parseRepairedJsonLd } from './json-ld-blocks';

// newinshop.co product pages (six fetched 2026-09-25): the product's own form is its
// single `.product-info` block, the block the store's cart script submits. It holds
// the product id (hidden input product_id) and, on four of the six, a required size
// select (option[N], "Beden") whose values carry no stock of their own and a zero
// price difference. The page's JSON-LD and meta availability is one claim for the
// whole product, so where the product asks for a choice that claim is no size's
// stock: the price stays and availability is unknown, in stock or out of stock alike.
// A choice that changes the price leaves no single product price. A form that cannot
// be tied to the page's product id, or a choice field outside it, gives no stock.
// Recommendation cards and carousels (which sit inside `.product-info`), modals, the
// review area and <template> content are never the product's form.
const HOST = /^(?:www\.)?newinshop\.co$/;
const ELSEWHERE = ['.prdbox', '.owl-carousel', '.caros', '.uk-modal', '#review'];
const CHOICE = ['select', 'input', 'textarea'].map(tag => `${tag}[name^="option["]`);

export type NewinshopChoice =
  | { kind: 'other_host' }
  | { kind: 'selection_address' }
  | { kind: 'unbound'; reason: string }
  | { kind: 'no_choice' }
  | { kind: 'price_differs' }
  | { kind: 'choice'; fields: number; values: number };

type Form = { blocks: number; productIds: string[]; metaIds: string[]; fields: number; stray: number; differences: (string | null)[] };

export function newinshopChoice(html: string, url: string): NewinshopChoice {
  let page: URL;
  try { page = new URL(url); } catch { return { kind: 'other_host' }; }
  if (page.protocol !== 'https:' || !HOST.test(page.hostname) || page.port || page.username || page.password) return { kind: 'other_host' };
  // The store has no size identity of ours to verify, so no chosen size is read here.
  if (page.searchParams.has('_butika_variant')) return { kind: 'selection_address' };
  const form = readForm(html);
  if (form.blocks !== 1) return { kind: 'unbound', reason: form.blocks ? 'several product forms' : 'no product form' };
  if (form.productIds.length !== 1 || !form.productIds[0]) return { kind: 'unbound', reason: 'product form id' };
  const named = [...schemaProductIds(html), ...form.metaIds];
  if (!named.length || named.some(id => id !== form.productIds[0])) return { kind: 'unbound', reason: 'product form is not this page\'s product' };
  if (form.stray) return { kind: 'unbound', reason: 'choice outside the product form' };
  if (!form.fields) return { kind: 'no_choice' };
  if (form.differences.some(difference => !zeroDifference(difference))) return { kind: 'price_differs' };
  return { kind: 'choice', fields: form.fields, values: form.differences.length };
}

/** A product that asks for a choice, or whose form is not tied to it, states no stock. */
export function newinshopWithholdsStock(html: string, url: string): boolean {
  const kind = newinshopChoice(html, url).kind;
  return kind === 'choice' || kind === 'unbound';
}

// The price step a choice adds, as the theme writes it on each option ("0").
const zeroDifference = (value: string | null) => value !== null && /^\s*0+(?:[.,]0+)?(?:\s*TL)?\s*$/i.test(value);

function readForm(html: string): Form {
  const form: Form = { blocks: 0, productIds: [], metaIds: [], fields: 0, stray: 0, differences: [] };
  let template = 0;
  let inForm = 0;
  let elsewhere = 0;
  const nested = (enter: () => void, leave: () => void): HTMLRewriterTypes.HTMLRewriterElementContentHandlers => ({
    element(el) {
      if (template) return;
      enter();
      // A block that is never closed keeps its scope open to the end of the page.
      if (el.canHaveContent) el.onEndTag(leave);
    },
  });
  const own = () => !template && !elsewhere && inForm > 0;
  const rewriter = new HTMLRewriter()
    .on('template', { element(el) { template++; el.onEndTag(() => { template--; }); } })
    .on('.product-info', nested(() => { form.blocks++; inForm++; }, () => { inForm--; }))
    .on('input[name="product_id"]', { element(el) { if (own()) form.productIds.push((el.getAttribute('value') ?? '').trim()); } })
    .on('meta[property="product:retailer_item_id"]', { element(el) { if (!template) form.metaIds.push((el.getAttribute('content') ?? '').trim()); } });
  for (const selector of ELSEWHERE) rewriter.on(selector, nested(() => { elsewhere++; }, () => { elsewhere--; }));
  for (const selector of CHOICE) {
    rewriter.on(selector, { element(el) {
      if (template || elsewhere) return;
      if (!inForm) { form.stray++; return; }
      form.fields++;
      const type = (el.getAttribute('type') ?? '').toLowerCase();
      if (el.tagName === 'input' && (type === 'radio' || type === 'checkbox')) form.differences.push(el.getAttribute('data'));
    } });
  }
  rewriter.on('select[name^="option["] option', { element(el) {
    if (!own() || !(el.getAttribute('value') ?? '').trim()) return;
    form.differences.push(el.getAttribute('data'));
  } });
  rewriter.transform(html);
  return form;
}

// Product ids the page's own JSON-LD states for its products (mended data included:
// it only has to name the same id as the form, it proves nothing by itself).
function schemaProductIds(html: string): string[] {
  const ids: string[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    const type = node['@type'];
    if ((type === 'Product' || (Array.isArray(type) && type.includes('Product'))) && node.productID !== undefined) ids.push(String(node.productID).trim());
    if (node['@graph']) walk(node['@graph']);
  };
  for (const block of jsonLdBlocks(html)) walk(parseJsonLd(block) ?? parseRepairedJsonLd(block));
  return ids;
}
