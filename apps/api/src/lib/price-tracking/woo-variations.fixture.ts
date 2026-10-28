// A trimmed WooCommerce variable-product page, keeping the relations the guard
// depends on from the page saved 2026-09-24
// (pelinsenoglu.com/urun/aragon-asimetrik-kesim-bluz-pantolon-takim/): one
// JSON-LD Product stating a product-level price and InStock, and the main
// product's variations_form whose action is this same page and whose
// data-product_variations payload states each variation's own price and stock.
// The real page's 18 variations share one price while 7 of them are sold out.
export type WooVariation = { id: number; renk: string; beden: string; price: number; inStock: boolean };

export type WooPageOptions = {
  url?: string;
  formAction?: string | null;
  productLevelPrice?: string;
  productLevelAvailability?: string;
  variations?: WooVariation[] | null;
  payload?: string | null;
  recommendation?: WooVariation[] | null;
  forms?: number;
};

export const WOO_URL = 'https://www.pelinsenoglu.com/urun/aragon-asimetrik-kesim-bluz-pantolon-takim/';

// Eight of the real page's eighteen: five in stock, three sold out, all 1999.
export const ARAGON_VARIATIONS: WooVariation[] = [
  { id: 1785901, renk: 'bordo', beden: 'small', price: 1999, inStock: false },
  { id: 1785902, renk: 'bordo', beden: 'medium', price: 1999, inStock: false },
  { id: 1785903, renk: 'bordo', beden: 'large', price: 1999, inStock: false },
  { id: 1785904, renk: 'haki', beden: 'small', price: 1999, inStock: true },
  { id: 1785905, renk: 'haki', beden: 'medium', price: 1999, inStock: true },
  { id: 1785907, renk: 'kahve', beden: 'small', price: 1999, inStock: true },
  { id: 1785908, renk: 'kahve', beden: 'medium', price: 1999, inStock: true },
  { id: 1785909, renk: 'kahve', beden: 'large', price: 1999, inStock: true },
];

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const variationJson = (variations: WooVariation[]) => JSON.stringify(variations.map(v => ({
  attributes: { attribute_pa_renk: v.renk, 'attribute_pa_beden-sml': v.beden },
  availability_html: '', display_price: v.price, display_regular_price: v.price,
  is_in_stock: v.inStock, is_purchasable: true, variation_id: v.id,
})));

export function wooPage(options: WooPageOptions = {}): string {
  const { url = WOO_URL, formAction = url, productLevelPrice = '1999.00',
    productLevelAvailability = 'https://schema.org/InStock', variations = ARAGON_VARIATIONS,
    payload, recommendation = null, forms = 1 } = options;
  const product = {
    '@context': 'https://schema.org/', '@type': 'Product', name: 'Aragon Asimetrik Kesim Bluz-Pantolon Takım',
    url, sku: 'P29456',
    offers: { '@type': 'Offer', price: productLevelPrice, priceCurrency: 'TRY', availability: productLevelAvailability, url },
  };
  const data = payload !== undefined ? payload : variations === null ? null : variationJson(variations);
  const form = (action: string | null, body: string | null) =>
    `<form class="variations_form cart"${action === null ? '' : ` action="${action}"`} method="post"`
    + ` data-product_id="1785897"${body === null ? '' : ` data-product_variations="${escape(body)}"`}>`
    + '<select name="attribute_pa_renk"><option value="bordo">Bordo</option></select>'
    + '<button type="submit" class="single_add_to_cart_button">Sepete ekle</button></form>';
  return `<!DOCTYPE html><html lang="tr"><head><title>Aragon Asimetrik Kesim Bluz-Pantolon Takım</title>
<link rel="canonical" href="${url}" />
<script type="application/ld+json">${JSON.stringify(product)}</script></head>
<body class="product woocommerce woocommerce-page">
<div class="summary entry-summary">
  <h1 class="product_title">Aragon Asimetrik Kesim Bluz-Pantolon Takım</h1>
  ${Array.from({ length: forms }, () => form(formAction, data)).join('\n  ')}
</div>
<section class="related products">
  <h2>Benzer ürünler</h2>
  ${recommendation === null ? '' : form('https://www.pelinsenoglu.com/urun/baska-bir-urun/', variationJson(recommendation))}
</section>
</body></html>`;
}
