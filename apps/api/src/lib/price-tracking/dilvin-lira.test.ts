import { expect, test } from 'bun:test';
import { dilvinPage, type DilvinPageOptions } from './dilvin-lira.fixture';
import { isVerifiedDilvinLira } from './dilvin-lira';
import { extractProductHtml } from './extract-product-price';

const url = 'https://www.dilvin.com.tr/21246-degaje-yaka-atlet-k-lacivert';
const read = (options: Partial<DilvinPageOptions> = {}, at = url) => extractProductHtml(dilvinPage({ url: at, ...options }), at);

test('a TRL label is read as TRY when the product shows the same amount in TL', () => {
  // Stock is kept as read with the page's own label on both sides.
  expect(read()).toEqual({ status: 'success', priceMinor: 59999, currency: 'TRY', availability: 'in_stock', source: 'json-ld' });
  expect(read({ price: '1699.99', visible: '1.699,99 TL' })).toMatchObject({ priceMinor: 169999, currency: 'TRY' });
  expect(read({ visible: '₺599,99' })).toMatchObject({ currency: 'TRY' });
});

test.each([
  ['another store', {}, 'https://www.example-butik.com/21246-degaje-yaka-atlet-k-lacivert'],
  ['no visible product price block, only a recommended product in TL', { visible: null, recommended: '599,99 TL' }, url],
  ['two product price blocks', { blocks: 2 }, url],
  ['a different visible amount', { visible: '549,99 TL' }, url],
  ['a visible amount without a lira label', { visible: '599,99' }, url],
  ['a visible amount in another currency', { visible: '599,99 USD' }, url],
  ['embedded data of another SKU', { embeddedSku: '101A21246_Siyah' }, url],
  ['an embedded price of another amount', { embeddedPrice: '549.99' }, url],
  ['an embedded price text of another amount', { embeddedText: '549,99 TL' }, url],
] as const)('the TRL label stays when the proof is missing: %s', (_name, options, at) => {
  const result = read(options, at);
  expect(result.status === 'success' && result.currency).toBe('TRL');
});

test('only a TRL label is corrected and only for the product page itself', () => {
  expect(read({ label: 'EUR' })).toMatchObject({ currency: 'EUR' });
  const html = dilvinPage({ url });
  expect(isVerifiedDilvinLira(html, url, 59999)).toBe(true);
  expect(isVerifiedDilvinLira(html, url, 54999)).toBe(false);
  expect(isVerifiedDilvinLira(html, `${url}?_butika_variant=offer:101A21246_K.Lacivert`, 59999)).toBe(false);
  expect(isVerifiedDilvinLira(dilvinPage({ url: 'https://www.dilvin.com.tr/baska-urun' }), url, 59999)).toBe(false);
});
