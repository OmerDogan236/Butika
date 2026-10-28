import { readStockMicrodata } from './microdata-stock';

// Panço serves an Akinon storefront on a Next.js theme. Its product record — the
// same shape the older Akinon themes put in `var rawProduct` — is only present
// inside the streaming payload strings of `self.__next_f.push([1, "..."])`, and the
// page carries no real <script type="application/ld+json"> element at all, so
// neither readAkinonProduct nor jsonLdBlocks can see it.
//
// This reader is deliberately narrow. It is the first evidenced scope only:
// https on panco.com.tr, a product page, and the structure observed on
// 2026-09-24. It never runs the store's JavaScript: the push argument is parsed
// as data with JSON.parse, and only the one JSON layer that holds the product is
// opened. Unsupported, truncated or otherwise unexpected payloads are refused
// rather than guessed at; this is not a general Next.js protocol reader.
//
// It answers with a price only, never with stock: the observed record carries
// `is_ready_to_basket: false` next to `in_stock: true` and `stock: 1`, and this
// page does not say why. Availability is therefore always unknown, and the
// existing stock, restock and baseline rules are untouched.
const HOSTS = new Set(['panco.com.tr', 'www.panco.com.tr']);
const MAX_PAYLOAD = 2_000_000;
// This reader only knows the Turkish lira form the theme writes, so it only ever
// answers in that currency: a record labelled otherwise is refused, not converted.
const CURRENCY = 'TRY';

type Json = Record<string, unknown>;
const object = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
// The pathname is compared exactly as the page and the record write it. Decoding it
// would make %2F look like a real separator and widen the identity, so it is not done.
const path = (value: string) => value.replace(/\/+$/, '');

export type AkinonNextProduct = { priceMinor: number; currency: string; availability: 'unknown'; pk: number; sku: string };

export function readAkinonNextProduct(html: string, rawUrl: string, expectedCurrency: string): AkinonNextProduct | null {
  if (expectedCurrency.toUpperCase() !== CURRENCY) return null;
  let page: URL;
  try { page = new URL(rawUrl); } catch { return null; }
  if (page.protocol !== 'https:' || !HOSTS.has(page.hostname.toLowerCase())) return null;
  // Credentials or a non-default port are outside the evidenced scope.
  if (page.username || page.password || page.port) return null;
  // The observed product address carries no query at all. A chosen size has its own
  // price, and an unknown option could select another price just as quietly, so any
  // query refuses the page rather than being ignored without knowing what it means.
  if (page.search) return null;
  const wanted = path(page.pathname);
  if (!wanted) return null;

  // The page must name itself, exactly once, as the product we asked for.
  const canonicals = readStockMicrodata(html).canonicals;
  if (canonicals.length !== 1) return null;
  try {
    const canonical = new URL(canonicals[0]!, rawUrl);
    if (canonical.origin !== page.origin || path(canonical.pathname) !== wanted) return null;
  } catch { return null; }

  const records = productRecords(html, wanted);
  if (records.length === 0) return null;
  // The theme streams this one product more than once: on the observed page three
  // times, as one full record and two leaner projections of it. That is not a
  // contradiction, so every field two records share has to carry the same value —
  // one differing field refuses the page — and the fullest record is the one read.
  if (contradicts(records)) return null;
  const record = [...records].sort((a, b) => Object.keys(b).length - Object.keys(a).length)[0]!;

  if (!positive(record.pk) || typeof record.sku !== 'string' || !record.sku.trim()) return null;
  if (String(record.product_type) !== '0' || record.price_type !== 'default' || record.is_listable !== true) return null;
  // An unknown source or a form-driven product is not a plain shelf price.
  if (record.data_source !== null || record.form_schema !== null) return null;
  // Both sources have to agree on the currency, and it has to be the one this
  // reader can read: the visible amount is only ever parsed as lira.
  if (String(record.currency_type).toUpperCase() !== CURRENCY) return null;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) return null;

  // The shelf price only, and only when both fields agree. A conditional basket
  // offer may exist beside it — its amount is never read and never computed from.
  const priceMinor = decimalMinor(record.price);
  if (priceMinor === null || priceMinor !== decimalMinor(record.retail_price)) return null;

  // The main product region has to prove itself: the page names this product, and
  // the theme's own detail price element is one of the amounts shown there. A
  // template body, a script, a recommendation strip or a link to another product
  // never takes part. Without that proof there is no answer.
  const region = mainProductRegion(html, page);
  if (!region.names.length || region.names.some(shown => shown !== name)) return null;
  if (!region.prices.length || !region.prices.some(price => price.detailLabel)) return null;
  if (region.prices.some(price => price.amount !== priceMinor)) return null;

  return { priceMinor, currency: CURRENCY, availability: 'unknown', pk: record.pk, sku: record.sku };
}

/** True when two records for this one address disagree on any field they share. */
function contradicts(records: Json[]): boolean {
  const seen = new Map<string, string>();
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      const written = JSON.stringify(value);
      const earlier = seen.get(key);
      if (earlier === undefined) seen.set(key, written);
      else if (earlier !== written) return true;
    }
  }
  return false;
}

/** Product objects whose own absolute_url is this page, taken from real script elements. */
function productRecords(html: string, wanted: string): Json[] {
  const found: Json[] = [];
  for (const payload of streamedPayloads(html)) {
    const needle = '"absolute_url":"';
    for (let at = payload.indexOf(needle); at >= 0; at = payload.indexOf(needle, at + 1)) {
      const end = payload.indexOf('"', at + needle.length);
      if (end < 0) continue;
      let value: string;
      try { value = path(payload.slice(at + needle.length, end)); } catch { continue; }
      if (value !== wanted) continue;
      const block = enclosingObject(payload, at);
      if (!block) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(block); } catch { continue; }
      if (object(parsed) && path(String(parsed.absolute_url)) === wanted) found.push(parsed);
    }
  }
  return found;
}

/**
 * The data argument of every `self.__next_f.push([1, "..."])` in a real script
 * element. Anything else — a different argument shape, a body that is not one
 * push call, a template body or a commented-out block — is refused, not repaired.
 */
function streamedPayloads(html: string): string[] {
  const payloads: string[] = [];
  let templateDepth = 0;
  let capture: { parts: string[] } | null = null;
  new HTMLRewriter().on('template', { element(el) { templateDepth++; el.onEndTag(() => { templateDepth--; }); } })
    .on('script', {
      element(el) {
        if (templateDepth || !el.canHaveContent) return;
        // A push payload is inline data; a src'd or typed module is not.
        const type = (el.getAttribute('type') ?? '').split(';')[0]?.trim().toLowerCase();
        if (el.getAttribute('src') !== null || (type && type !== 'text/javascript')) return;
        const current = { parts: [] as string[] };
        capture = current;
        el.onEndTag(() => {
          const body = current.parts.join('');
          if (body.length <= MAX_PAYLOAD) {
            const payload = pushPayload(body);
            if (payload !== null) payloads.push(payload);
          }
          if (capture === current) capture = null;
        });
      },
      text(chunk) { capture?.parts.push(chunk.text); },
    })
    .transform(html);
  return payloads;
}

/** `self.__next_f.push([1,"…"])` → the string, or null for any other shape. */
function pushPayload(body: string): string | null {
  const match = /^\s*self\.__next_f\.push\(([\s\S]*)\)\s*;?\s*$/.exec(body);
  if (!match) return null;
  let argument: unknown;
  try { argument = JSON.parse(match[1]!); } catch { return null; }
  if (!Array.isArray(argument) || argument.length !== 2) return null;
  return argument[0] === 1 && typeof argument[1] === 'string' ? argument[1] : null;
}

/**
 * The innermost JSON object that contains `from`. The scan runs forward from the
 * start of the payload and knows where strings are, because the streamed markup
 * around the record is full of braces that live inside string values; a backwards
 * scan would stop at one of those and cut the object in the wrong place.
 */
function enclosingObject(payload: string, from: number): string | null {
  const open: number[] = [];
  let inString = false, escaped = false;
  for (let i = 0; i < payload.length; i++) {
    const char = payload[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') open.push(i);
    else if (char === '}') {
      const start = open.pop();
      if (start === undefined) return null;
      if (start <= from && i >= from) return payload.slice(start, i + 1);
    }
  }
  return null;
}

// "795" or "795.00" as the API writes it. Mirrors the vetted form used by the
// other API readers; no currency conversion and no arithmetic on offers.
function decimalMinor(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

type MainRegion = { names: string[]; prices: { amount: number; detailLabel: boolean }[] };

/**
 * What this page shows for this product, and nothing else. The theme marks its own
 * product title and price elements with data-testid, and writes the detail page's
 * price with its detail_page_price_label class. Anything inside a <template> or a
 * <script>, inside a recommendation <aside>, or inside a link that points at another
 * address is not this product's display and is left out entirely.
 */
function mainProductRegion(html: string, page: URL): MainRegion {
  const names: string[] = [];
  const prices: { amount: number; detailLabel: boolean }[] = [];
  let hidden = 0;
  let capture: { parts: string[]; take: (text: string) => void } | null = null;
  const wanted = path(page.pathname);
  // A link leads away unless it names this very product on this very origin. The
  // same path on another origin, a credentialed or reported host, and any product
  // option query all count as somewhere else.
  const outside = (href: string | null) => {
    if (href === null) return false;
    let target: URL;
    try { target = new URL(href, page); } catch { return true; }
    if (target.origin !== page.origin) return true;
    if (target.username || target.password || target.port !== page.port) return true;
    if (target.search) return true;
    return path(target.pathname) !== wanted;
  };
  const start = (el: HTMLRewriterTypes.Element, take: (text: string) => void) => {
    if (hidden || !el.canHaveContent) return;
    const current = { parts: [] as string[], take };
    capture = current;
    el.onEndTag(() => {
      current.take(current.parts.join(''));
      if (capture === current) capture = null;
    });
  };
  new HTMLRewriter()
    .on('template, script, aside', { element(el) { hidden++; el.onEndTag(() => { hidden--; }); } })
    .on('a[href]', {
      element(el) {
        if (!outside(el.getAttribute('href'))) return;
        hidden++;
        el.onEndTag(() => { hidden--; });
      },
    })
    .on('[data-testid="product-name"]', { element(el) { start(el, text => names.push(text.trim())); } })
    .on('[data-testid="price"]', {
      element(el) {
        const detailLabel = (el.getAttribute('class') ?? '').includes('detail_page_price_label');
        start(el, text => prices.push({ amount: liraMinor(text) ?? Number.NaN, detailLabel }));
      },
    })
    .on('*', { text(chunk) { capture?.parts.push(chunk.text); } })
    .transform(html);
  return { names, prices };
}

// "795,00 TL", "1.795,00 TL", "₺795,00": exactly one lira label, as dilvin-lira.ts
// reads the same Turkish form.
function liraMinor(value: string): number | null {
  const text = value.replace(/&nbsp;| /g, ' ').trim();
  const match = /^(₺\s*)?(\d{1,3}(?:\.\d{3})+|\d{1,13})(?:,(\d{2}))?\s*(TL|₺)?$/.exec(text);
  if (!match || !match[1] === !match[4]) return null;
  return Number(match[2]!.replace(/\./g, '')) * 100 + Number(match[3] ?? '0');
}
