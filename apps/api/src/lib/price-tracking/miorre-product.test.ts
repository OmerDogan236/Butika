import { expect, test } from 'bun:test';
import { MIORRE_URL, miorrePage, miorreRecommendation, type MiorrePageOptions } from './miorre.fixture';
import { readMiorreProduct, type MiorreProduct } from './miorre-product';

const read = (options: MiorrePageOptions = {}, at: string = MIORRE_URL, currency = 'TRY') =>
  readMiorreProduct(miorrePage(options), at, currency);
const product: MiorreProduct = { priceMinor: 15300, currency: 'TRY', availability: 'unknown', productCode: '48150' };

test('the current price of the one box holding this product code', () => {
  expect(read()).toEqual(product);
  // The crossed-out 191,00 is the old price and is never the answer.
  expect(read({ sale: '149,90 TL', mobileSale: '149,90 TL' })).toMatchObject({ priceMinor: 14990 });
  expect(read({ old: '1.191,00 TL', sale: '1.153,50 TL', mobileOld: '1.191,00 TL', mobileSale: '1.153,50 TL' }))
    .toMatchObject({ priceMinor: 115350 });
  expect(read({ old: null })).toEqual(product);
  expect(read({ sale: '₺153,00', mobileSale: '₺153,00' })).toEqual(product);
});

test('the store apex and a trailing slash name the same product', () => {
  expect(read({}, MIORRE_URL.replace('www.miorre', 'miorre'))).toEqual(product);
  expect(read({}, `${MIORRE_URL}/`)).toEqual(product);
});

test('the page decides no stock: availability is always unknown', () => {
  // The quantity box allows 253, the Sepete Ekle button is disabled and the page
  // carries a stock modal. None of that is read.
  expect(read()).toHaveProperty('availability', 'unknown');
  expect(read({ sale: '149,90 TL', mobileSale: '149,90 TL' })).toHaveProperty('availability', 'unknown');
  expect(miorrePage()).toContain('max="253"');
  expect(miorrePage()).toContain('Ürün stokta bulunmamaktadır.');
});

test('the add-to-basket box and the comment tab anchor are not a choice of product', () => {
  // Both live on the observed page: a Sepete Ekle button in the second
  // product-detail-box, and an href="#" anchor inside the product code itself.
  expect(miorrePage()).toContain('<button type="submit"');
  expect(miorrePage()).toContain('<a class="tab-selector" href="#"');
  expect(read()).toEqual(product);
});

test.each([
  ['a recommended product with its own price', miorreRecommendation(null, '99,00 TL')],
  ['a recommended product with its own code', miorreRecommendation('99999', null)],
  ['a recommended product with both', miorreRecommendation('99999', '99,00 TL')],
  ['a recommended product rendered as a product-detail-box, price only',
    miorreRecommendation(null, '99,00 TL', 'product-detail-box')],
  ['a recommended product rendered as a product-detail-box, code only',
    miorreRecommendation('99999', null, 'product-detail-box')],
  ['a whole product box inside a template',
    `<template>${miorreRecommendation('99999', '99,00 TL', 'product-detail-box')}</template>`],
  ['a whole product box inside a comment',
    `<!-- ${miorreRecommendation('99999', '99,00 TL', 'product-detail-box')} -->`],
  ['a price written in a script', '<script>var pi = \'<div class="pi-price-sale">99,00 TL</div>\';</script>'],
] as const)('what stands outside the product does not change the reading: %s', (_name, extra) => {
  expect(read({ extra })).toEqual(product);
});

test('a second box carrying both a code and a price leaves the product ambiguous', () => {
  expect(read({ extra: miorreRecommendation('99999', '99,00 TL', 'product-detail-box') })).toBeNull();
  expect(read({ extra: miorreRecommendation('48150', '153,00 TL', 'yCmsContentSlot product-detail-box') })).toBeNull();
});

test.each([
  ['only the old price is stated', { sale: null }],
  ['two current amounts', { saleCount: 2 }],
  ['two price blocks', { priceBlocks: 2 }],
  ['a current amount without a lira label', { sale: '153,00' }],
  ['a current amount labelled in another currency', { sale: '153,00 USD' }],
  ['a current amount with two labels', { sale: '₺153,00 TL' }],
  ['a current amount of zero', { sale: '0,00 TL' }],
  ['a code other than the one the address names', { code: '48151' }],
  ['the current amount outside the price block',
    { sale: null, inMainBox: '<div class="pi-price-sale"><span>153,00 TL</span></div>' }],
  ['a second code in the product box', { inMainBox: '<span data-product-code="48151"></span>' }],
  ['the mobile bar states another amount', { mobileSale: '149,90 TL' }],
  ['the mobile bar states only the old price', { mobileSale: null }],
  ['the mobile bar states the old price as its own text', { mobileOld: null, mobileSale: '191,00 TL' }],
  ['no mobile bar', { mobileBars: 0 }],
  ['two mobile bars', { mobileBars: 2 }],
] as const)('the price is not read when the page does not state it plainly: %s', (_name, options) => {
  expect(read(options)).toBeNull();
});

test.each([
  ['a size select', '<select name="size"><option>125 ML</option><option>250 ML</option></select>'],
  ['size radios', '<label><input type="radio" name="size" value="125"/>125 ML</label>'],
  ['a colour checkbox', '<label><input type="checkbox" name="color" value="mavi"/>Mavi</label>'],
  ['an option button', '<button type="button" class="js-size">250 ML</button>'],
  ['a link to a sibling product', '<a href="/tr/Pierre-Cardin/p/48151">250 ML</a>'],
  ['an absolute link to a sibling product', '<a href="https://miorre.com.tr/tr/Pierre-Cardin/p/48151/">250 ML</a>'],
] as const)('a price is not attributed to an unchosen option: %s', (_name, inMainBox) => {
  expect(read({ inMainBox })).toBeNull();
});

test.each([
  ['another currency is expected', MIORRE_URL, 'USD'],
  ['another store', MIORRE_URL.replace('www.miorre.com.tr', 'www.miorre.example'), 'TRY'],
  ['a look-alike host', MIORRE_URL.replace('www.miorre.com.tr', 'miorre.com.tr.example.com'), 'TRY'],
  ['plain http', MIORRE_URL.replace('https:', 'http:'), 'TRY'],
  ['a query string', `${MIORRE_URL}?integration_size=125`, 'TRY'],
  ['a variant query of our own', `${MIORRE_URL}?_butika_variant=offer%3A48150`, 'TRY'],
  ['embedded credentials', MIORRE_URL.replace('https://', 'https://user:pass@'), 'TRY'],
  ['a non-default port', MIORRE_URL.replace('miorre.com.tr', 'miorre.com.tr:8443'), 'TRY'],
  ['a category address, not a product', 'https://www.miorre.com.tr/K%C4%B0%C5%9E%C4%B0SEL-BAKIM/c/48150', 'TRY'],
  ['an address naming another code', MIORRE_URL.replace('/p/48150', '/p/48151'), 'TRY'],
  ['a percent-encoded code', MIORRE_URL.replace('/p/48150', '/p/48%31%35%30'), 'TRY'],
  ['a broken encoding', MIORRE_URL.replace('/p/48150', '/p/48150%'), 'TRY'],
  ['no code at all', 'https://www.miorre.com.tr/p/', 'TRY'],
  ['a malformed address', 'https://', 'TRY'],
  ['not an address', 'miorre.com.tr/p/48150', 'TRY'],
] as const)('the reader stays inside its scope: %s', (_name, at, currency) => {
  expect(read({}, at, currency)).toBeNull();
});

test.each([
  ['the variant field carries a size', { variantField: 'OTHER-SIZE' }],
  ['the variant field is missing', { variantField: null }],
  ['two variant fields', { variantFields: 2 }],
  ['another base type', { baseType: '01' }],
  ['no base type at all', { baseType: null }],
  ['the forms post another product', { postedCode: '48151' }],
  ['no form posts a product code', { postedCode: null }],
  ['one more form posts another product',
    { extra: '<form><input type="hidden" name="productCodePost" value="48151"/></form>' }],
  ['one more field states another base type', { extra: '<input type="hidden" name="baseType" value="01"/>' }],
  ['one more variant field', { extra: '<input type="hidden" id="variant-prodCode"/>' }],
] as const)('the page has to be shaped like the one this reader was written for: %s', (_name, options) => {
  expect(read(options)).toBeNull();
});

test('the observed shape is read from the page, not assumed', () => {
  // Two add-to-basket forms post the same code and the same base type, and one
  // empty variant field stands at the end of the page.
  expect(miorrePage().match(/name="productCodePost" value="48150"/g)).toHaveLength(2);
  expect(miorrePage().match(/name="baseType" value="00"/g)).toHaveLength(2);
  expect(miorrePage()).toContain('<input type="hidden" id="variant-prodCode"/>');
  expect(read()).toEqual(product);
});

test.each([
  ['a size link on this same path', '<a href="?size=M">M</a>'],
  ['a size link with a query and a fragment', '<a href="?size=M#beden">M</a>'],
  ['a link on another port', '<a href="https://www.miorre.com.tr:8443/tr/Pierre-Cardin/p/48150">M</a>'],
  ['a link carrying credentials', '<a href="https://u:p@www.miorre.com.tr/tr/Pierre-Cardin/p/48150">M</a>'],
  ['a link over plain http', '<a href="http://www.miorre.com.tr/tr/Pierre-Cardin/p/48150">M</a>'],
  ['a link to another store', '<a href="https://www.miorre.example/p/48150">M</a>'],
  ['a link handled by a script', "<a href=\"javascript:selectSize('M')\">M</a>"],
  ['a link to a sibling product', '<a href="/tr/Pierre-Cardin/p/48151">250 ML</a>'],
  ['an absolute link to a sibling product', '<a href="https://miorre.com.tr/tr/Pierre-Cardin/p/48151/">250 ML</a>'],
] as const)('a link whose scope this reader cannot judge is a possible choice: %s', (_name, inMainBox) => {
  expect(read({ inMainBox })).toBeNull();
});

test('an anchor leading back to this same page is not a choice', () => {
  expect(read({ inMainBox: '<a href="#tab-comments">Yorumlar</a>' })).toEqual(product);
  expect(read({ inMainBox: `<a href="${MIORRE_URL}">Bu ürün</a>` })).toEqual(product);
  expect(read({ inMainBox: '<a href="">Bu sayfa</a>' })).toEqual(product);
});

test.each([
  ['a template standing in for the shown amount', { saleInner: '<template>153,00 TL</template>' }],
  ['a template inside the shown span', { saleInner: '<span><template>153,00 TL</template></span>' }],
  ['a script inside the shown span', { saleInner: '<span><script>var p = "153,00 TL";</script></span>' }],
  ['a style inside the shown span', { saleInner: '<span><style>/* 153,00 TL */</style></span>' }],
  ['a template standing in for the mobile amount',
    { mobileInner: '<span>191,00 TL</span><template>153,00 TL</template>' }],
] as const)('an amount hidden inside the shown price is not the price: %s', (_name, options) => {
  expect(read(options)).toBeNull();
});

test('a hidden amount beside the shown one does not change the reading', () => {
  expect(read({ saleInner: '<span>153,00 TL</span><template>99,00 TL</template>' })).toEqual(product);
  expect(read({ saleInner: '<span>153,00 TL<script>var p = 99;</script></span>' })).toEqual(product);
  expect(read({ mobileInner: '<span>191,00 TL</span>153,00 TL<template>99,00 TL</template>' })).toEqual(product);
});

test('a hidden element does not leave the rest of the page unread', () => {
  // The add-to-basket forms and the variant field stand after the price block and
  // after the mobile bar. A template or a script inside either of them must close
  // again, or everything the shape check depends on would be read as markup.
  expect(read({ inMainBox: '<template><div class="pi-price-sale">99,00 TL</div></template>' })).toEqual(product);
  expect(read({ mobileInner: '<span>191,00 TL</span>153,00 TL<template>99,00 TL</template>' })).toEqual(product);
  expect(read({ mobileInner: '<span>191,00 TL</span>153,00 TL<script>var p = 99;</script>' })).toEqual(product);
  expect(read({ saleInner: '<span>153,00 TL</span><style>.x { color: red; }</style>' })).toEqual(product);
});
