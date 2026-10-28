import { expect, test } from 'bun:test';
import { extractProductHtml } from './extract-product-price';
import { jsonLdBlocks, parseJsonLd, parseRepairedJsonLd } from './json-ld-blocks';

const block = (attributes: string, body: string) => `<script ${attributes}>${body}</script>`;
const BREAK = String.fromCharCode(10), TAB = String.fromCharCode(9), QUOTE = String.fromCharCode(34);

test('the plain reader takes the page as written and mends nothing', () => {
  expect(parseJsonLd('{"a":1}')).toEqual({ a: 1 });
  expect(parseJsonLd(`{"a":"break${BREAK}inside"}`)).toBeUndefined();
  // Only a block that needed mending comes back from the repaired reader.
  expect(parseRepairedJsonLd('{"a":1}')).toBeUndefined();
});

test('repairs raw control characters inside a string and nothing else', () => {
  // A pretty-printed block: the line breaks between tokens are ordinary whitespace,
  // the one inside the string is what makes the block invalid.
  expect(parseRepairedJsonLd(`{${BREAK} "name": "Line${BREAK}break",${BREAK} "price": "1.00"${BREAK}}`))
    .toEqual({ name: `Line${BREAK}break`, price: '1.00' });
  expect(parseRepairedJsonLd(`{"tab":"a${TAB}b"}`)).toEqual({ tab: `a${TAB}b` });
  // An escaped quote does not end the string, so the break after it is still inside.
  expect(parseRepairedJsonLd(`{"a":"quote \\${QUOTE} and${BREAK}break"}`)).toEqual({ a: `quote ${QUOTE} and${BREAK}break` });
});

test.each([
  ['an unescaped quote inside a string', '{"a":"say "hi" to"}'],
  ['several documents in one block', '{"a":1},{"b":2}'],
  ['a trailing comma', '{"a":1,}'],
  ['text that is not json at all', 'var product = 1;'],
  ['an empty block', '   '],
])('is not repaired: %s', (_name, text) => {
  expect(parseJsonLd(text)).toBeUndefined();
  expect(parseRepairedJsonLd(text)).toBeUndefined();
});

test('a page whose json-ld carries a raw line break is still read', () => {
  // newinshop.co: the description holds real line breaks and the price currency meta
  // tag is empty, so only the repaired block can answer. The product form carries the
  // product id and no size, so the page's stock stands (newinshop-size-stock.ts).
  const url = 'https://www.newinshop.co/baliksirti-desenli-yelek';
  const product = `{"@context":"https://schema.org","@type":"Product","name":"Yelek","url":"${url}",` +
    `"description":">%64 Pes${BREAK}${BREAK}>Astarlı",` +
    `"offers":{"@type":"Offer","priceCurrency":"TRY","price":"5250.00 ","url":"${url}","availability":"http://schema.org/InStock"}}`;
  const html = `<html><head><link href="${url}" rel="canonical" />` +
    '<meta property="product:retailer_item_id" content="1000000099" />' +
    '<meta property="product:price:amount" content="5250.00" /><meta property="product:price:currency" content="" />' +
    `${block('type="application/ld+json"', product)}</head><body>` +
    '<div class="uk-grid product-info"><input type="hidden" name="product_id" size="2" value="1000000099" /></div></body></html>';
  expect(extractProductHtml(html, url)).toEqual({ status: 'success', priceMinor: 525000, currency: 'TRY', availability: 'in_stock', source: 'json-ld' });
});

test('finds json-ld with or without quotes around the type, in document order', () => {
  const html = block('type="application/ld+json"', '{"a":1}') + block("type='application/ld+json'", '{"b":2}') +
    block('type=application/ld+json', '{"c":3}') + block('data-x="1" type = application/ld+json async', '{"d":4}') +
    block('type="application/ld+json; charset=utf-8"', '{"e":5}') + block('data-note="a>b" type=application/ld+json', '{"f":6}');
  expect(jsonLdBlocks(html)).toEqual(['{"a":1}', '{"b":2}', '{"c":3}', '{"d":4}', '{"e":5}', '{"f":6}']);
});

// Codex review 2026-09-22 (json-ld-0015-review.ts): markup that must not pass for
// this page's product data.
test.each([
  ['another attribute named like the type', '<script data-type=application/ld+json type=text/plain>{"a":1}</script>'],
  ['a type written inside another value', `<script data-note=" type='application/ld+json'" type=text/plain>{"a":1}</script>`],
  ['a commented-out block', '<!-- <script type=application/ld+json>{"a":1}</script> -->'],
  ['a template body', '<template><script type=application/ld+json>{"a":1}</script></template>'],
  ['a near-miss media type', '<script type=application/ld+jsonp>{"a":1}</script>'],
  ['script-like text inside a script', `<script>var s = '<script type=application/ld+json>{"a":1}<\\/script>';</script>`],
  ['another type entirely', '<script type="text/javascript">var a = 1;</script>'],
  ['no type at all', '<script>{"a":1}</script>'],
  ['an unterminated block', '<script type=application/ld+json>{"a":1}'],
])('is not json-ld data: %s', (_name, html) => {
  expect(jsonLdBlocks(html)).toEqual([]);
});

test('keeps the body exactly as served', () => {
  // A script's content is raw text: entities and escapes belong to the JSON.
  const body = '{"name":"A&amp;B \\u00e9 <b>","price":"1.00"}';
  expect(jsonLdBlocks(block('type="application/ld+json"', body))).toEqual([body]);
});

test('a Turkish capital İ before the block does not move its end', () => {
  // "İ".toLowerCase() is two characters, so a lowercased copy of the page would
  // report the closing tag one position late for every İ before it.
  const html = `<p>İNDİRİM</p>${block('type="application/ld+json"', '{"price":"1"}')}<script>var x = 1;</script>`;
  expect(jsonLdBlocks(html)).toEqual(['{"price":"1"}']);
});

test('a page written without quotes is read like any other', () => {
  // jimmykey.com: minified HTML with unquoted attributes on the canonical link and
  // the JSON-LD script; the offer is otherwise ordinary.
  const url = 'https://www.jimmykey.com/en/100-linen-woven-vest_6sw305389/mustard/63';
  const product = { '@context': 'https://schema.org', '@type': 'Product', name: 'Woven vest', url,
    offers: { '@type': 'Offer', url, priceCurrency: 'TRY', price: 1699.95, availability: 'https://schema.org/InStock' } };
  const html = `<html><head><link rel=canonical href=${url}>` +
    `<script type=application/ld+json>${JSON.stringify([product])}</script></head><body></body></html>`;
  // The price is read. The stock of a jimmykey page is its size list's to decide
  // (jimmykey-size-stock.ts), and this trimmed page has none, so it is unknown there;
  // the same markup at any other address keeps its stock.
  expect(extractProductHtml(html, url)).toEqual({ status: 'success', priceMinor: 169995, currency: 'TRY', availability: 'unknown', source: 'json-ld' });
  const other = url.replace('www.jimmykey.com', 'www.example.com');
  expect(extractProductHtml(html.replaceAll(url, other), other)).toEqual({ status: 'success', priceMinor: 169995, currency: 'TRY', availability: 'in_stock', source: 'json-ld' });
});

// lutvelizade.com.tr writes type="application/ld&#x2B;json". What the parser hands
// back is measured here, not assumed: the attribute as written, references and all.
test('the parser hands the type attribute back as the page wrote it', () => {
  const typeOf = (attributes: string) => {
    const seen: (string | null)[] = [];
    new HTMLRewriter().on('script', { element(el) { seen.push(el.getAttribute('type')); } }).transform(block(attributes, '{}'));
    return seen;
  };
  expect(typeOf('type="application/ld&#x2B;json"')).toEqual(['application/ld&#x2B;json']);
  expect(typeOf("type='application/ld&#43;json'")).toEqual(['application/ld&#43;json']);
  expect(typeOf('type=application/ld&#x2B;json')).toEqual(['application/ld&#x2B;json']);
  expect(typeOf('type="application/ld&amp;#x2B;json"')).toEqual(['application/ld&amp;#x2B;json']);
  expect(typeOf('type="application&sol;ld&plus;json"')).toEqual(['application&sol;ld&plus;json']);
  expect(typeOf('type=""')).toEqual([null]);
});

test.each([
  ['a hexadecimal reference', 'type="application/ld&#x2B;json"'],
  ['a decimal reference', "type='application/ld&#43;json'"],
  ['an unquoted value', 'type=application/ld&#x2B;json'],
  ['an upper-case X and lower-case digits', 'type="application/ld&#X2b;json"'],
  ['leading zeros', 'type="application/ld&#0043;json"'],
  ['no closing semicolon', 'type="application/ld&#x2Bjson"'],
  ['an encoded slash as well', 'type="application&#x2F;ld&#x2B;json"'],
  ['an encoded parameter separator', 'type="application/ld&#x2B;json&#x3B; charset=utf-8"'],
  ['an encoded leading space', 'type="&#x20;application/ld&#x2B;json"'],
])('a type written with character references is json-ld: %s', (_name, attributes) => {
  expect(jsonLdBlocks(block(attributes, '{"a":1}'))).toEqual(['{"a":1}']);
});

test.each([
  ['an escaped ampersand before the reference', 'type="application/ld&amp;#x2B;json"'],
  ['an encoded ampersand before the reference', 'type="application/ld&#x26;#x2B;json"'],
  ['another media type', 'type="application&#x2F;json"'],
  ['a script type', 'type="text&#x2F;javascript"'],
  ['a near miss', 'type="application/ld&#x2B;jsonp"'],
  ['a named reference, left as written', 'type="application&sol;ld&plus;json"'],
  ['a value beyond Unicode', 'type="application/ld&#x110000;json"'],
  ['NUL', 'type="application/ld&#0;json"'],
  ['a lone surrogate', 'type="application/ld&#xD800;json"'],
  ['a number too large for any code point', 'type="application/ld&#99999999999999999999999;json"'],
  ['the reference in another attribute', 'data-type="application/ld&#x2B;json" type="text/plain"'],
])('an encoded type is not json-ld: %s', (_name, attributes) => {
  expect(jsonLdBlocks(block(attributes, '{"a":1}'))).toEqual([]);
});

test('an encoded type keeps every other scope rule', () => {
  const encoded = block('type="application/ld&#x2B;json"', '{"a":1}');
  expect(jsonLdBlocks(`<template>${encoded}</template>`)).toEqual([]);
  expect(jsonLdBlocks(`<!-- ${encoded} -->`)).toEqual([]);
  // A data block fetches nothing: with an external src only the inline text counts,
  // exactly as for the plain type.
  for (const body of ['', '{"a":1}']) {
    expect(jsonLdBlocks(`<script type="application/ld&#x2B;json" src="/p.json">${body}</script>`))
      .toEqual(jsonLdBlocks(`<script type="application/ld+json" src="/p.json">${body}</script>`));
  }
  expect(jsonLdBlocks('<script src="/app.js"></script>')).toEqual([]);
  // Only the attribute is decoded; the body is still kept exactly as served.
  const body = '{"name":"A&amp;B &#x2B; \\u00e9","price":"1.00"}';
  expect(jsonLdBlocks(block('type="application/ld&#x2B;json"', body))).toEqual([body]);
});

test('a page that encodes its json-ld type is read like any other', () => {
  // lutvelizade: one Product with one Offer and no availability; the encoded type was
  // all that kept the block out of view. The price is read, the stock stays unknown.
  const url = 'https://www.lutvelizade.com.tr/asimetrik-kesim-siyah-kadin-terlik-modelleri-p';
  const product = { '@context': 'https://schema.org', '@type': 'Product', name: 'Terlik', sku: '26IW011050008-001',
    offers: { '@type': 'Offer', url, priceCurrency: 'TRY', price: '599.96' } };
  const html = (type: string) =>
    `<html><head><link rel="canonical" href="${url}">${block(`type="${type}"`, JSON.stringify(product))}</head><body></body></html>`;
  expect(extractProductHtml(html('application/ld&#x2B;json'), url))
    .toEqual({ status: 'success', priceMinor: 59996, currency: 'TRY', availability: 'unknown', source: 'json-ld' });
  expect(extractProductHtml(html('application/ld&amp;#x2B;json'), url)).toEqual({ status: 'not_found', error: 'No supported product price found' });
});
