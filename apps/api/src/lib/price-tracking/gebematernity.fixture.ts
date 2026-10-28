// gebematernity.com product page, trimmed from the pages fetched 2026-09-22 22:26Z
// (cardigan-arrow 97b2ead2…, dress-carlotta 2641eaa5…): the canonical, shortlink and
// REST links, the JSON-LD Product with its one Offer priced by a
// UnitPriceSpecification, the body's postid class and, inside #product-N, the one
// variations form written without an action attribute, its payload (each variation
// trimmed to the fields the reader uses) and its add-to-cart and product_id fields.
// The two pages' variation ids, prices and stock states are the real ones; every other
// state, id or address built from them is made up.
export const GEBE_ARROW_URL = 'https://gebematernity.com/product/cardigan-arrow/';
export const GEBE_CARLOTTA_URL = 'https://gebematernity.com/product/dress-carlotta/';

export type GebeVariation = { id: number; color: string; size: string; price: number; inStock: boolean };

// cardigan-arrow as fetched: twelve variations at 213.85, navy S and M in stock.
export const ARROW_VARIATIONS: GebeVariation[] = [
  { id: 2021, color: 'dusty-pink-632', size: 'm', price: 213.85, inStock: false },
  { id: 2022, color: 'dusty-pink-632', size: 'l', price: 213.85, inStock: false },
  { id: 2020, color: 'dusty-pink-632', size: 's', price: 213.85, inStock: false },
  { id: 2799, color: 'navy-a50', size: 's', price: 213.85, inStock: true },
  { id: 2800, color: 'navy-a50', size: 'm', price: 213.85, inStock: true },
  { id: 2801, color: 'navy-a50', size: 'l', price: 213.85, inStock: false },
  { id: 2803, color: 'caramel', size: 's', price: 213.85, inStock: false },
  { id: 2804, color: 'caramel', size: 'm', price: 213.85, inStock: false },
  { id: 2805, color: 'caramel', size: 'l', price: 213.85, inStock: false },
  { id: 2807, color: 'black-006', size: 's', price: 213.85, inStock: false },
  { id: 2808, color: 'black-006', size: 'm', price: 213.85, inStock: false },
  { id: 2809, color: 'black-006', size: 'l', price: 213.85, inStock: false },
];

// dress-carlotta as fetched: five black sizes at 844.35, all sold out.
export const CARLOTTA_VARIATIONS: GebeVariation[] = ['xs', 's', 'm', 'l', 'xl'].map((size, i) =>
  ({ id: 13889 + i, color: 'black-006', size, price: 844.35, inStock: false }));

export const GEBE_CARLOTTA = { url: GEBE_CARLOTTA_URL, productId: '13888', name: 'Dress for Pregnancy', sku: 'G8115206', price: '844.35',
  availability: 'OutOfStock', variations: CARLOTTA_VARIATIONS } as const;

export type GebePage = {
  url?: string; productId?: string; name?: string; sku?: string; price?: string; availability?: string;
  variations?: GebeVariation[]; payload?: string | null;
  // undefined: no action attribute, as fetched.
  action?: string;
  formProductId?: string | null; postIds?: readonly string[]; blockId?: string | null; addToCart?: string | null; hiddenProductId?: string | null;
  shortlink?: string | null; rest?: string | null; canonical?: string | null; forms?: number; tail?: string;
};

const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export const gebeVariationJson = (variations: GebeVariation[]) => JSON.stringify(variations.map(v => ({
  attributes: { attribute_pa_color: v.color, attribute_pa_size: v.size }, availability_html: '', backorders_allowed: false,
  display_price: v.price, display_regular_price: 714.35, is_in_stock: v.inStock, is_purchasable: true, max_qty: v.inStock ? 21 : '',
  sku: 'G6113401', variation_id: v.id, variation_is_active: true, variation_is_visible: true,
})));

export function gebePage(o: GebePage = {}): string {
  const url = o.url ?? GEBE_ARROW_URL;
  const origin = new URL(url).origin;
  const id = o.productId ?? '2019';
  const price = o.price ?? '213.85';
  const product = {
    '@context': 'https://schema.org/', '@graph': [{
      '@context': 'https://schema.org/', '@type': 'Product', '@id': `${url}#product`, name: o.name ?? 'Cardigan for Pregnancy', url,
      sku: o.sku ?? 'G6113401',
      offers: [{ '@type': 'Offer', priceSpecification: [{ '@type': 'UnitPriceSpecification', price, priceCurrency: 'TRY', valueAddedTaxIncluded: true,
        validThrough: '2027-12-31' }], priceValidUntil: '2027-12-31', availability: `https://schema.org/${o.availability ?? 'InStock'}`, url }],
    }],
  };
  const payload = o.payload !== undefined ? o.payload : gebeVariationJson(o.variations ?? ARROW_VARIATIONS);
  const formId = o.formProductId === undefined ? id : o.formProductId;
  const addToCart = o.addToCart === undefined ? id : o.addToCart;
  const hiddenId = o.hiddenProductId === undefined ? id : o.hiddenProductId;
  const form = [
    `<form class="variations_form cart"${o.action === undefined ? '' : ` action="${o.action}"`} method="post" enctype='multipart/form-data'`,
    formId === null ? '' : ` data-product_id="${formId}"`, payload === null ? '' : ` data-product_variations="${escapeAttribute(payload)}"`, '>',
    '<table class="variations"><tr><td class="value"><select id="pa_size" name="attribute_pa_size"><option value="">Choose an option</option>',
    '<option value="s">S</option><option value="m">M</option><option value="l">L</option></select></td></tr></table>',
    '<div class="single_variation_wrap"><div class="woocommerce-variation-add-to-cart variations_button">',
    '<button type="submit" class="single_add_to_cart_button button alt">ADD TO BAG</button>',
    addToCart === null ? '' : `<input type="hidden" name="add-to-cart" value="${addToCart}" />`,
    hiddenId === null ? '' : `<input type="hidden" name="product_id" value="${hiddenId}" />`,
    '<input type="hidden" name="variation_id" class="variation_id" value="0" /></div></div></form>',
  ].join('');
  const shortlink = o.shortlink === undefined ? `${origin}/?p=${id}` : o.shortlink;
  const rest = o.rest === undefined ? `${origin}/wp-json/wp/v2/product/${id}` : o.rest;
  const canonical = o.canonical === undefined ? url : o.canonical;
  const blockId = o.blockId === undefined ? id : o.blockId;
  const summary = `<div class="summary entry-summary"><h1 class="product_title entry-title">${o.name ?? 'Cardigan for Pregnancy'}</h1>` +
    `${Array.from({ length: o.forms ?? 1 }, () => form).join('')}<div data-product_id="${id}" data-threshold_min="30"></div></div>`;
  return [
    '<!DOCTYPE html><html lang="en-US"><head>',
    canonical === null ? '' : `<link rel="canonical" href="${canonical}" />`,
    shortlink === null ? '' : `<link rel='shortlink' href='${shortlink}' />`,
    rest === null ? '' : `<link rel="alternate" title="JSON" type="application/json" href="${rest}" />`,
    `<link rel="alternate" title="oEmbed (JSON)" type="application/json+oembed" href="${origin}/wp-json/oembed/1.0/embed?url=${encodeURIComponent(url)}" />`,
    `<script type="application/ld+json">${JSON.stringify(product)}</script></head>`,
    `<body class="product-template-default single single-product ${(o.postIds ?? [id]).map(p => `postid-${p}`).join(' ')} theme-fashion-theme woocommerce">`,
    blockId === null ? summary : `<div id="product-${blockId}" class="product type-product post-${blockId} status-publish first instock">${summary}</div>`,
    '<section class="related products"><ul class="products"><li class="product type-product post-1601">',
    `<a href="${origin}/product/cardigan-valeri/">Cardigan</a></li></ul></section>`,
    o.tail ?? '', '</body></html>',
  ].join('');
}
