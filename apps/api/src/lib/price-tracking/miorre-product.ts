// Miorre runs SAP Commerce (Hybris). Its product page publishes no JSON-LD, no
// canonical link, no og:price and no microdata price, so every reader in the chain
// reaches the end. The only price the page states is in the theme's own markup, and
// the only identity it states is the code the address already names.
//
// This reader is deliberately narrow: https on miorre.com.tr, a /p/<code> address,
// and the one page shape observed on 2026-09-21. It is not a general Hybris reader,
// and it decides no stock.
//
// Identity is a DOM relation, not a page-wide search. The theme reuses the
// product-detail-box class for the add-to-basket slot and the social links, so the
// code and the price count only when one single box holds both: its
// data-product-code must be the code the address names, and the price must come
// from that same box's product-prices. The crossed-out list price is never read,
// and the page's mobile bar has to state the same current amount.
const HOSTS = new Set(['miorre.com.tr', 'www.miorre.com.tr']);
const CURRENCY = 'TRY';
// The category names lead the path and the code closes it: /<kategori>/<ad>/p/48150.
const PRODUCT_PATH = /\/p\/([A-Za-z0-9-]+)\/?$/;
// The one page shape this reader was written for. On the observed page the
// add-to-basket forms post this same product code, the hidden baseType field reads
// 00 and the single variant-prodCode field stands empty. That combination is the
// limit of the first example examined, not a claim about what 00 means elsewhere on
// Hybris: a page shaped differently is simply not one this reader can answer for.
const BASE_TYPE = '00';

export type MiorreProduct = { priceMinor: number; currency: string; availability: 'unknown'; productCode: string };

type Region = { codes: string[]; priceBlocks: number; sale: (number | null)[]; choices: number };
type Shape = { postedCodes: string[]; baseTypes: string[]; variantFields: string[] };

export function readMiorreProduct(html: string, rawUrl: string, expectedCurrency: string): MiorreProduct | null {
  if (expectedCurrency.toUpperCase() !== CURRENCY) return null;
  let page: URL;
  try { page = new URL(rawUrl); } catch { return null; }
  if (page.protocol !== 'https:' || !HOSTS.has(page.hostname.toLowerCase())) return null;
  if (page.username || page.password || page.port || page.search) return null;

  // The address names the product. The path is read as served — not decoded, not
  // lower-cased — so two differently written addresses stay two products, and a
  // code this reader cannot read plainly is no code at all.
  const wanted = PRODUCT_PATH.exec(page.pathname)?.[1];
  if (!wanted) return null;

  const read = readPage(html, page);
  if (!read) return null;
  const { region, mobile, shape } = read;

  // The page is shaped the way the observed one was. Missing, conflicting or
  // repeated evidence leaves the shape unsupported rather than assumed.
  if (!shape.postedCodes.length || shape.postedCodes.some(code => code !== wanted)) return null;
  if (!shape.baseTypes.length || shape.baseTypes.some(type => type !== BASE_TYPE)) return null;
  if (shape.variantFields.length !== 1 || shape.variantFields[0] !== '') return null;

  // One code in that box, and it is the code the address names.
  if (region.codes.length !== 1 || region.codes[0] !== wanted) return null;
  // One price block in it, stating one current price.
  if (region.priceBlocks !== 1 || region.sale.length !== 1) return null;
  const priceMinor = region.sale[0];
  if (priceMinor === null || priceMinor === undefined) return null;
  // The page's mobile bar repeats this product: the old amount sits in its own
  // element there and the current amount is the bar's own text. Only the second is
  // read, and it has to agree.
  if (mobile !== priceMinor) return null;
  // A choice of size or colour would make the shown price belong to some option.
  // This product offers none: the observed box has no select, no radio, no button,
  // and its only link is the comment tab leading back to this same page. The
  // quantity box is not a choice of product.
  if (region.choices > 0) return null;

  return { priceMinor, currency: CURRENCY, availability: 'unknown', productCode: wanted };
}

/**
 * The one product-detail-box holding both a code and a price block, the sale amount
 * the mobile bar states itself, and the hidden fields that describe the page shape.
 *
 * Read with Bun's HTML parser, so a template body, a comment and a script's contents
 * are markup rather than this product's data — including when they sit inside an
 * element the page does show. Every element is classified in one handler and closed
 * by one end-tag callback: two callbacks registered on the same element from two
 * selectors do not both run, which would silently leave a counter open.
 */
function readPage(html: string, page: URL): { region: Region; mobile: number | null; shape: Shape } | null {
  const regions: Region[] = [], stack: Region[] = [];
  const shape: Shape = { postedCodes: [], baseTypes: [], variantFields: [] };
  let hidden = 0, priceDepth = 0, mobileBars = 0, mobileDepth = 0, mobile: number | null = null;
  let bar: { text: string } | null = null;
  let sale: { region: Region; text: string } | null = null;

  // An anchor is left alone only when it plainly leads back to this same page, as
  // the comment tab's href="#" does. Anything else in the product box — another
  // path, a query, another origin, credentials, a port, a scheme of its own — may
  // be choosing an option, and this reader does not judge which.
  const staysOnThisPage = (href: string) => {
    let target: URL;
    try { target = new URL(href, page); } catch { return false; }
    return target.protocol === page.protocol && target.host === page.host && !target.username && !target.password &&
      target.pathname === page.pathname && !target.search;
  };

  new HTMLRewriter().on('*', {
    element(el) {
      const ends: Array<() => void> = [];
      const tag = el.tagName.toLowerCase();
      // Bun reports an empty attribute value as null, so an href written as "" is
      // read as no destination at all — which is what it means on this page.
      const attribute = (name: string) => el.getAttribute(name) ?? '';
      const holds = el.canHaveContent;

      if (bar && holds) { mobileDepth++; ends.push(() => { mobileDepth--; }); }
      if (tag === 'template' || tag === 'script' || tag === 'style') {
        if (holds) { hidden++; ends.push(() => { hidden--; }); }
      } else if (!hidden) {
        const classes = new Set(attribute('class').split(/\s+/));
        if (classes.has('product-detail-box')) {
          const box: Region = { codes: [], priceBlocks: 0, sale: [], choices: 0 };
          if (holds) { stack.push(box); ends.push(() => { regions.push(box); if (stack.at(-1) === box) stack.pop(); }); }
          else regions.push(box);
        }
        const box = stack.at(-1);
        if (box) {
          const code = el.getAttribute('data-product-code');
          if (code) box.codes.push(code);
          if (classes.has('product-prices')) box.priceBlocks++;
          // Only the current price, and only from inside that box's own price block.
          // The pi-price-cross amount beside it is the old price and is never read.
          if (classes.has('pi-price-sale') && priceDepth && holds) {
            const capture = { region: box, text: '' };
            sale = capture;
            ends.push(() => { capture.region.sale.push(liraMinor(capture.text)); if (sale === capture) sale = null; });
          }
          if (isChoice(tag, attribute, staysOnThisPage)) box.choices++;
        }
        if (classes.has('product-prices') && holds) { priceDepth++; ends.push(() => { priceDepth--; }); }
        if (classes.has('fixed-bottom-price')) {
          mobileBars++;
          if (holds) {
            const capture = { text: '' };
            bar = capture; mobileDepth = 0;
            ends.push(() => { mobile = liraMinor(capture.text); bar = null; });
          }
        }
        if (tag === 'input') {
          if (attribute('name') === 'productCodePost') shape.postedCodes.push(attribute('value'));
          if (attribute('name') === 'baseType') shape.baseTypes.push(attribute('value'));
        }
        if (attribute('id') === 'variant-prodCode') shape.variantFields.push(attribute('value'));
      }

      if (ends.length) el.onEndTag(() => { for (const close of ends.reverse()) close(); });
    },
    text(chunk) {
      if (hidden) return;
      if (sale) sale.text += chunk.text;
      if (bar && !mobileDepth) bar.text += chunk.text;
    },
  }).transform(html);

  const main = regions.filter(box => box.codes.length > 0 && box.priceBlocks > 0);
  if (main.length !== 1 || mobileBars !== 1) return null;
  return { region: main[0]!, mobile, shape };
}

// A control that would make the shown price belong to something the visitor picks.
function isChoice(tag: string, attribute: (name: string) => string, staysOnThisPage: (href: string) => boolean): boolean {
  if (tag === 'select' || tag === 'button') return true;
  if (tag === 'input') return ['radio', 'checkbox'].includes(attribute('type').toLowerCase());
  if (tag === 'a') { const href = attribute('href'); return href !== '' && !staysOnThisPage(href); }
  return false;
}

// "153,00 TL", "1.153,00 TL", "₺153,00": exactly one lira label, read as
// dilvin-lira.ts reads the same Turkish form. No first-or-last-number guessing.
function liraMinor(value: string): number | null {
  const text = value.replace(/&nbsp;| /g, ' ').trim();
  const match = /^(₺\s*)?(\d{1,3}(?:\.\d{3})+|\d{1,13})(?:,(\d{2}))?\s*(TL|₺)?$/.exec(text);
  if (!match || !match[1] === !match[4]) return null;
  const minor = Number(match[2]!.replace(/\./g, '')) * 100 + Number(match[3] ?? '0');
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
