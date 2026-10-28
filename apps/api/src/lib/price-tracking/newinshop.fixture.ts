// newinshop.co product page, trimmed from the page fetched 2026-09-25
// (baliksirti-desenli-yelek, 91751319d4ad…): the mended JSON-LD Product, the product
// meta tags, and the one `.product-info` block holding the title, the price, the
// required "Beden" select (option[801], every value data="0"), the hidden product_id
// and, inside the same block, the recommendation carousel. Test data only: prices,
// stock and later states built from it are made up.
export const NEWINSHOP_URL = 'https://www.newinshop.co/baliksirti-desenli-yelek';
export const NEWINSHOP_ID = '1000000099';
const BREAK = String.fromCharCode(10);

export type NewinshopPage = {
  url?: string; price?: string; availability?: string | null; validUntil?: string; schemaId?: string | null; metaId?: string | null;
  sizes?: string[] | null; differences?: (string | null)[]; formIds?: string[]; forms?: number;
  card?: string; tail?: string; bodyClass?: string;
};

// "5550.00" → "5.550,00 TL", as the page shows it.
const shown = (price: string) => {
  const [whole = '0', fraction = '00'] = price.trim().split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction.padEnd(2, '0')} TL`;
};
const option = (label: string, index: number, difference: string | null) =>
  `<option value="${3017 + index}" data-prefix="+"${difference === null ? '' : ` data="${difference}"`} data-img="https://www.newinshop.co/image/data/no_image.jpg"> ${label} </option>`;
const sizeBlock = (sizes: string[] | null, differences: (string | null)[] = []) => sizes === null ? '<!-- OPTIONS --> <!-- //OPTIONS -->' : [
  '<!-- OPTIONS --><div class="optionsboxWrap _v0"><div class="optionsbox">',
  '<div id="option-801" class="optionitem _required_ select-opt oTitle-beden"><label class="bord"><span class="required">*</span> Beden </label>',
  `<select name="option[801]"><option value="">Beden</option>${sizes.map((size, i) => option(size, i, differences[i] ?? (i in differences ? null : '0'))).join('')}</select>`,
  '</div></div></div><!-- //OPTIONS -->',
].join('');

export const newinshopCarousel = (inside = '') => [
  '<div class="uk-width-medium-1-1 uk-margin caros carospr"><div id="caro2" class="owl-caro owl-carousel owl-theme">',
  `<div class="prdbox _v2"><div class="uk-panel uk-panel-box">${inside}<div class="price"><span class="pure-price">4.750,00 TL</span></div>`,
  '<div class="buttonBar"><div class="addToCartBtn"><a class="uk-button uk-button-primary" id="btn-1000000100" onclick="addToCart(\'1000000100\')"> Sepete Ekle </a></div></div>',
  '</div></div></div></div>',
].join('');

const productInfo = (o: NewinshopPage, price: string) => [
  '<div class="uk-grid product-info"><div class="uk-width-medium-5-10 dtlbox"><div class="rowBox mb"><h1 class="prd-title">Balıksırtı Desenli Yelek</h1>',
  `<div class="priceLine uk-position-relative"><div class="prodPrice"><span class="price price-new">${shown(price)}</span></div></div></div>`,
  `<div class="rowBox prodActions mb">${sizeBlock(o.sizes === undefined ? ['XS/34', 'S/36', 'M/38'] : o.sizes, o.differences)}`,
  '<div class="action-items uk-margin-bottom _v0"><div class="quantity-to-cart"><input type="text" id="order-quantity" name="quantity" size="2" min="1" value="1" />',
  (o.formIds ?? [NEWINSHOP_ID]).map(id => `<input type="hidden" name="product_id" size="2" value="${id}" />`).join(''),
  '</div><a class="uk-button uk-button-primary cart-action" type="button" id="button-cart"> Sepete Ekle </a></div></div>',
  o.card ?? newinshopCarousel(), '</div></div>',
].join('');

export function newinshopPage(o: NewinshopPage = {}): string {
  const url = o.url ?? NEWINSHOP_URL;
  const price = o.price ?? '5550.00';
  const schemaId = o.schemaId === undefined ? NEWINSHOP_ID : o.schemaId;
  const availability = o.availability === undefined ? 'InStock' : o.availability;
  const offer = `{"@type":"Offer","priceCurrency":"TRY","price":"${price} ","priceValidUntil":"${o.validUntil ?? '10/04/2040'}","url":"${url}",` +
    `"itemCondition":"http://schema.org/NewCondition"${availability === null ? '' : `,"availability":"http://schema.org/${availability}"`}}`;
  const product = `{"@context":"http://schema.org/","@type":"Product","name":"Balıksırtı Desenli Yelek","description":">%64 Pes${BREAK}${BREAK}>Astarlı",` +
    `"mpn":"BaliksirtiDesenliYelek"${schemaId === null ? '' : `,"productID":"${schemaId}"`},"offers":${offer}}`;
  const metaId = o.metaId === undefined ? NEWINSHOP_ID : o.metaId;
  return [
    `<html><head><link href="${url}" rel="canonical" /><meta property="og:url" content="${url}" />`,
    metaId === null ? '' : `<meta property="product:retailer_item_id" content="${metaId}" />`,
    `<meta property="product:availability" content="in stock" /><meta property="product:price:amount" content="${price}" />`,
    `<meta property="product:price:currency" content="" /><script type="application/ld+json">${product}</script></head>`,
    `<body class="${o.bodyClass ?? ''}">`, Array.from({ length: o.forms ?? 1 }, () => productInfo(o, price)).join(''), o.tail ?? '', '</body></html>',
  ].join('');
}
