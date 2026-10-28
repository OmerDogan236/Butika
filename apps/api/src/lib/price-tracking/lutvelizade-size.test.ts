import { afterEach, describe, expect, test } from 'bun:test';
import { extractProductHtml, extractProductPrice, type ProductPriceExtraction } from './extract-product-price';
import { resolveProductPrice } from './price-source-router';
import { readLutvelizadeSelection } from './lutvelizade-size';
import { CODE, LUTVELIZADE_URL, PPV, RECOMMENDED_CARD, SAVED_DIALOG, SAVED_SIZES, SIZE, dialogHtml, lutvelizadePage, productJsonLd, selectedUrl, type Size } from './lutvelizade.fixture';

// A chosen Lutvelizade size is answered from its own product page only. The saved
// page's state is real; every "synthetic" state below is made up, and a size that
// keeps its GUID across lists is the assumption under test, not the store's
// observed behaviour.
const OTHER_PPV = '37e21cbb-bd8a-4707-9957-96ce5df80f84';
const NEW_GUID = '0f0e0d0c-0b0a-4908-8706-050403020100';
const found = (availability: 'in_stock' | 'out_of_stock'): ProductPriceExtraction => ({ status: 'success', priceMinor: 59996, currency: 'TRY', availability, source: 'lutvelizade' });
const refused = (reason: string): ProductPriceExtraction => ({ status: 'not_found', error: `Selected Lutvelizade size cannot be verified: ${reason}` });
const read = (id: string, page = lutvelizadePage(), ppv = PPV) => extractProductHtml(page, selectedUrl(id, ppv));

describe('the selection identity', () => {
  test('binds the page ppv and a size GUID, keeping every other parameter of the address', () => {
    expect(readLutvelizadeSelection(`${selectedUrl(SIZE[38])}&utm_source=x`)).toEqual({
      sourceUrl: `${LUTVELIZADE_URL}?utm_source=x`, productId: PPV, variantId: SIZE[38] });
    expect(readLutvelizadeSelection(selectedUrl(SIZE[38], PPV, 'https://lutvelizade.com.tr/asimetrik-kesim-siyah-kadin-terlik-modelleri-p'))?.variantId).toBe(SIZE[38]);
    expect(readLutvelizadeSelection(LUTVELIZADE_URL)).toBeNull();
    expect(readLutvelizadeSelection(`${LUTVELIZADE_URL}?_butika_variant=offer:ABC`)).toBeNull();
  });

  test.each([
    ['an upper-case GUID', selectedUrl(SIZE[38].toUpperCase())],
    ['a missing size', `${LUTVELIZADE_URL}?_butika_variant=lutvelizade:${PPV}`],
    ['a third part', `${selectedUrl(SIZE[38])}%3A1`],
    ['two selections', `${selectedUrl(SIZE[38])}&_butika_variant=lutvelizade:${PPV}:${SIZE[36]}`],
    ['another prefix beside it', `${selectedUrl(SIZE[38])}&_butika_variant=ikas:${PPV}:${SIZE[36]}`],
    ['http', selectedUrl(SIZE[38]).replace('https:', 'http:')],
    ['another host', selectedUrl(SIZE[38], PPV, 'https://lutvelizade.com.tr.example.com/p')],
    ['an unexpected port', selectedUrl(SIZE[38], PPV, 'https://www.lutvelizade.com.tr:8443/p')],
    ['user information', selectedUrl(SIZE[38], PPV, 'https://user:pass@www.lutvelizade.com.tr/p')],
    ['a size that is not a GUID', `${LUTVELIZADE_URL}?_butika_variant=lutvelizade:${PPV}:38`],
  ])('%s is an invalid identity and never a product-level answer', (_, url) => {
    expect(readLutvelizadeSelection(url)?.variantId).toBe('');
    expect(extractProductHtml(lutvelizadePage(), url)).toEqual({ status: 'not_found', error: 'Invalid selected variant identity' });
  });
});

describe('the saved page (2026-09-24)', () => {
  test('the one selectable size is in stock and every size in the dialog is sold out, at the product price', () => {
    expect(read(SIZE[38])).toEqual(found('in_stock'));
    for (const size of [36, 37, 39, 40] as const) expect(read(SIZE[size])).toEqual(found('out_of_stock'));
  });

  test('every size selectable and no dialog: each is in stock', () => {
    const page = lutvelizadePage({ sizes: Object.values(SIZE).map((id, i) => ({ label: String(36 + i), id })), dialog: null });
    for (const id of Object.values(SIZE)) expect(read(id, page)).toEqual(found('in_stock'));
  });

  test('every size sold out: each is sold out', () => {
    const page = lutvelizadePage({ sizes: Object.keys(SIZE).map(label => ({ label, disabled: true })),
      dialog: Object.entries(SIZE).map(([label, id]) => ({ label, id })) });
    for (const id of Object.values(SIZE)) expect(read(id, page)).toEqual(found('out_of_stock'));
  });

  test('without a selection the page keeps its price-only answer', () => {
    expect(extractProductHtml(lutvelizadePage(), LUTVELIZADE_URL)).toEqual({ status: 'success', priceMinor: 59996, currency: 'TRY', availability: 'unknown', source: 'json-ld' });
  });

  test('a recommended product elsewhere on the page lends neither price nor identity', () => {
    const lending = `${RECOMMENDED_CARD}<div class="card"><a id="favorite" data-ppv-id="${OTHER_PPV}"></a><span class="price discounted">1,00 TL</span>
      <div class="variation size"><ul><li><a href="javascript:;" data-id="${SIZE[36]}" title="36">36</a></li></ul></div></div>`;
    const page = lutvelizadePage({ extra: lending });
    expect(read(SIZE[36], page)).toEqual(found('out_of_stock'));
    expect(read(SIZE[38], page)).toEqual(found('in_stock'));
    expect(read(SIZE[36], page, OTHER_PPV)).toEqual(refused('product identity'));
  });
});

describe('synthetic transitions (made up: the store was not seen doing this)', () => {
  test('a sold-out size comes back under the same GUID: in stock', () => {
    const sizes = SAVED_SIZES.map(s => s.label === '36' ? { label: '36', id: SIZE[36] } : s);
    const page = lutvelizadePage({ sizes, dialog: SAVED_DIALOG.filter(s => s.label !== '36') });
    expect(read(SIZE[36], page)).toEqual(found('in_stock'));
  });

  test('the selectable size sells out under the same GUID: sold out', () => {
    const sizes = SAVED_SIZES.map(s => s.label === '38' ? { label: '38', disabled: true } : s);
    const page = lutvelizadePage({ sizes, dialog: [...SAVED_DIALOG, { label: '38', id: SIZE[38] }] });
    expect(read(SIZE[38], page)).toEqual(found('out_of_stock'));
  });

  test('a size that comes back under a new GUID is unknown for the old one, never sold out', () => {
    const sizes = SAVED_SIZES.map(s => s.label === '36' ? { label: '36', id: NEW_GUID } : s);
    const page = lutvelizadePage({ sizes, dialog: SAVED_DIALOG.filter(s => s.label !== '36') });
    expect(read(SIZE[36], page)).toEqual(refused('size not on page'));
    expect(read(NEW_GUID, page)).toEqual(found('in_stock'));
  });
});

describe('a page that does not bind the size gives no answer, not even a price', () => {
  const sizesWith = (change: (s: Size) => Size) => SAVED_SIZES.map(change);
  test.each([
    ['the same GUID in both lists', { sizes: sizesWith(s => s.label === '36' ? { label: '36', id: SIZE[36] } : s), dialog: SAVED_DIALOG }, SIZE[36], 'size lists'],
    ['a sold-out size that keeps its GUID in the block', { sizes: sizesWith(s => s.label === '36' ? { label: '36', id: SIZE[36], disabled: true } : s) }, SIZE[36], 'size lists'],
    ['a selectable size without a GUID', { sizes: sizesWith(s => s.label === '38' ? { label: '38' } : s) }, SIZE[36], 'size lists'],
    ['a label twice in the block', { sizes: [...SAVED_SIZES, { label: '38', id: NEW_GUID }] }, SIZE[38], 'size lists'],
    ['a label twice in the dialog', { dialog: [...SAVED_DIALOG, { label: '36', id: NEW_GUID }] }, SIZE[37], 'size lists'],
    ['a GUID twice in the dialog', { dialog: SAVED_DIALOG.map(s => s.label === '37' ? { label: '37', id: SIZE[36] } : s) }, SIZE[36], 'size lists'],
    ['a dialog size the block does not show as sold out', { dialog: [...SAVED_DIALOG, { label: '41', id: NEW_GUID }] }, SIZE[36], 'size lists'],
    ['a dialog size the block shows as selectable', { dialog: [...SAVED_DIALOG, { label: '38', id: NEW_GUID }] }, SIZE[36], 'size lists'],
    ['a sold-out size missing from the dialog', { dialog: SAVED_DIALOG.filter(s => s.label !== '40') }, SIZE[36], 'size lists'],
    ['sold-out sizes and no dialog', { dialog: null }, SIZE[38], 'size lists'],
    ['a sold-out size marked in the dialog as well', { dialog: SAVED_DIALOG.map(s => s.label === '36' ? { ...s, disabled: true } : s) }, SIZE[36], 'size lists'],
    ['a second size list in the block', { inBlock: '<div class="variation size"><ul><li><a href="javascript:;" data-id="' + NEW_GUID + '">42</a></li></ul></div>' }, SIZE[38], 'size lists'],
    ['a second dialog', { extra: dialogHtml(SAVED_DIALOG) }, SIZE[36], 'size lists'],
    ['the sold-out sizes split over two dialogs', { dialog: SAVED_DIALOG.slice(0, 2), extra: dialogHtml(SAVED_DIALOG.slice(2)) }, SIZE[36], 'size lists'],
    ['a second product block', { extra: `<div class="details"><a data-ppv-id="${OTHER_PPV}"></a></div>` }, SIZE[38], 'product block'],
    ['another product on this address', { ppv: OTHER_PPV }, SIZE[38], 'product identity'],
    ['a structured product with another code', { jsonLd: productJsonLd({ sku: 'OTHER-1' }) }, SIZE[38], 'structured product'],
    ['a structured offer for another address', { jsonLd: productJsonLd({}, { url: 'https://www.lutvelizade.com.tr/asimetrik-kesim-caramel-kadin-terlik-modelleri-p' }) }, SIZE[38], 'structured product'],
    ['a second structured product', { jsonLd: { '@graph': [productJsonLd(), productJsonLd({ sku: 'OTHER-1' })] } }, SIZE[38], 'structured product'],
    ['two offers', { jsonLd: productJsonLd({ offers: [productJsonLd().offers, productJsonLd().offers] }) }, SIZE[38], 'structured product'],
    ['a block code the structured product does not have', { code: 'OTHER-1' }, SIZE[38], 'structured product'],
    ['a displayed price other than the offer', { prices: '<span class="price discounted">699,96 TL</span>' }, SIZE[38], 'price'],
    ['two current prices', { prices: '<span class="price discounted">599,96 TL</span><span class="price discounted">599,96 TL</span>' }, SIZE[38], 'price'],
    ['no displayed price', { prices: '' }, SIZE[38], 'price'],
    ['an offer in another currency', { jsonLd: productJsonLd({}, { priceCurrency: 'USD' }) }, SIZE[38], 'price'],
  ] as [string, Parameters<typeof lutvelizadePage>[0], string, string][])('%s', (_, options, id, reason) => {
    expect(read(id, lutvelizadePage(options))).toEqual(refused(reason));
  });

  test('a GUID the page does not show at all is unknown, never sold out', () => {
    expect(read(NEW_GUID)).toEqual(refused('size not on page'));
  });

  test('an unreadable JSON-LD block could hide another product', () => {
    const page = lutvelizadePage().replace('</body>', '<script type="application/ld+json">{"@type":"Product",</script></body>');
    expect(read(SIZE[38], page)).toEqual(refused('structured product'));
  });

  test('a page cut off inside the size list gives no reading', () => {
    const page = lutvelizadePage();
    expect(read(SIZE[38], page.slice(0, page.indexOf(`data-id="${SIZE[38]}"`) + 60))).toMatchObject({ status: 'not_found' });
  });

  test('a size list inside a template is not the page', () => {
    const page = lutvelizadePage({ inBlock: `<template><div class="variation size"><ul><li><a data-id="${NEW_GUID}">42</a></li></ul></div></template>` });
    expect(read(SIZE[38], page)).toEqual(found('in_stock'));
  });

  test('the product code and ppv of the saved page are the ones bound', () => {
    expect(lutvelizadePage()).toContain(`<span>${CODE}</span>`);
    expect(read(SIZE[38], lutvelizadePage({ jsonLd: productJsonLd({ sku: CODE, mpn: 'X' }) }))).toEqual(found('in_stock'));
  });
});

describe('through the fetch and the router', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  test('the page is fetched without the selection, and the selection answers alone', async () => {
    const requested: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      requested.push(String(input instanceof Request ? input.url : input));
      return new Response(lutvelizadePage(), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }) as typeof fetch;
    expect(await extractProductPrice(selectedUrl(SIZE[36]))).toEqual(found('out_of_stock'));
    expect(requested).toEqual([LUTVELIZADE_URL]);
    expect(await resolveProductPrice({ url: selectedUrl(SIZE[38]) })).toMatchObject({ status: 'success',
      observation: { priceMinor: 59996, currency: 'TRY', availability: 'in_stock', method: 'lutvelizade' },
      attempts: [{ provider: 'structured_html', status: 'success' }] });
    // Unverifiable: the router has no other source to ask.
    const refusedResult = await resolveProductPrice({ url: selectedUrl(NEW_GUID) });
    expect(refusedResult).toMatchObject({ status: 'failed', attempts: [{ provider: 'structured_html', status: 'failure' }] });
    expect(refusedResult.status === 'failed' && refusedResult.attempts).toHaveLength(1);
  });
});
