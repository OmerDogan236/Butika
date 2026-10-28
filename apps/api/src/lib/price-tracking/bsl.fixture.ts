// www.bsl.com.tr product page, trimmed from the one saved body (midi skirt 21048-175,
// a2ec8a15…, 2026-09-09): the canonical, og:url and JSON-LD Product (sku code-colour, one
// product-level Offer), and the one `.ProductContent` block with the hidden ProductID,
// ColorID and page addresses, the two colour options (175 active, 320), the size chart,
// the size list (XXS, XS, S and M on sale; L sold out: span.outer + NotifyWhen, no
// noStockLine) and the add-to-bag button (product code, product id, comma amount). Around
// it: suggested products, modals, the footer and the page's PID. Test data only: every
// other price, stock state, colour or product built from it is made up.
export const BSL_URL = 'https://www.bsl.com.tr/tr/siyah-toka-ve-drape-detayli-midi-etek_21048-175';
export const BSL_PRODUCT_ID = '11745';
const PATH = '/tr/siyah-toka-ve-drape-detayli-midi-etek_21048-175';

export type BslPageSize = { id: string; label: string; onSale: boolean };
// The page of 2026-09-09 as saved: four sizes on sale, L sold out.
export const BSL_SIZES: BslPageSize[] = [
  { id: '11', label: 'XXS', onSale: true }, { id: '38', label: 'XS', onSale: true }, { id: '6', label: 'S', onSale: true },
  { id: '36', label: 'M', onSale: true }, { id: '10', label: 'L', onSale: false },
];
export const bslEvery = (onSale: boolean) => BSL_SIZES.map(size => ({ ...size, onSale }));

export type BslPage = {
  url?: string; price?: string; amount?: string | null; availability?: string | null; sizes?: BslPageSize[]; sizeList?: string;
  canonical?: string | null; sku?: string | null; offerUrl?: string | null; schema?: string;
  productId?: string | null; pageId?: string | null; colourId?: string | null; activeColour?: string; activeProductId?: string; activeColours?: number;
  basketCode?: string | null; basketProductId?: string | null; blocks?: number; inBlock?: string; tail?: string; bodyClass?: string;
};

export const bslSizeLink = (size: BslPageSize) =>
  `<span class="selectSize"> <a data-id="${size.id}" class="${size.label}" data-name="${size.label}" data-stock="${size.onSale ? 'True' : 'False'}" href="javascript:void(0)">${size.label}</a> </span>`;
export const bslSoldOut = (size: Pick<BslPageSize, 'id' | 'label'>) => [
  `<span class="outer"> <input type="hidden" name="SizeIDs" id="SizeIDs" value="${size.id}" />`,
  '<span class="PdHint"> <span class="PdHint-content"> <a href="javascript:;" class="NotifyWhen">Stoğa Gelince Haber Ver</a> </span> </span>',
  `<span class="inner">&nbsp;&nbsp;${size.label}&nbsp;&nbsp;</span> </span>`,
].join(' ');
export const bslSizeList = (sizes: BslPageSize[], extra = '') => [
  '<div class="col-24 col-sm-24 col-md-24 col-lg-24 col-xl-24 SizeOptions"> <div id="SelectSizePopup"> <span>L&#252;tfen bir Beden se&#231;iniz.</span> </div>',
  sizes.map(size => size.onSale ? bslSizeLink(size) : bslSoldOut(size)).join(' '), extra, '</div>',
].join(' ');

const hidden = (id: string, value: string | null | undefined) => value === null || value === undefined ? '' : `<input type="hidden" id="${id}" name="${id}" value="${value}" />`;

function productContent(o: BslPage, amount: string | null): string {
  const option = (colour: string, active: boolean, productId = BSL_PRODUCT_ID) =>
    `<div class="ColorOption"> <div class="ColorOptionItem${active ? ' active' : ''}"> <a id="changeColor" href="javascript:" data-id="${colour}" data-productid="${productId}"><img src="x.webp" /></a> </div> </div>`;
  return [
    '<div class="ProductContent"> <div class="row"> <div class="Prices"> <h1 class="ProductHeader">Toka Ve Drape Detaylı Midi Etek</h1>',
    `<input type="hidden" id="pvUrl" name="pvUrl" value="${PATH}" />`,
    hidden('ProductID', o.productId === undefined ? BSL_PRODUCT_ID : o.productId),
    '<input type="hidden" id="DatalayerProductCode" name="DatalayerProductCode" value="21048" /> <input type="hidden" id="CurColor" value="Siyah" />',
    '<div class="PriceContainer"><span class="Price">1.149,99 TL</span></div> </div> </div>',
    `<div class="row Colors"> ${hidden('ColorID', o.colourId === undefined ? '175' : o.colourId)} <div class="ColorThumb"></div> <div class="row ItemColorsContainer">`,
    option('320', false), Array.from({ length: o.activeColours ?? 1 }, () => option(o.activeColour ?? '175', true, o.activeProductId)).join(''), '</div> </div>',
    '<div class="find-table-size"> <div class="SizeTableArea"> <div class="SizeTable"><span>Beden Tablosu</span></div> </div> </div>',
    '<div class="Sizes row SizeAndAmount"> <input type="hidden" id="SizeID" name="SizeID" value="" /> <div class="LastProducts More"><span class="LastText">Son</span></div>',
    o.sizeList ?? bslSizeList(o.sizes ?? BSL_SIZES), '</div>',
    '<div class="row BasktButtons"> <div class="AddToBasket ProductDetails AutoTextRep">',
    '<button type="button" name="Basket" id="Basket" class="CartButtonColor NotSelected"',
    o.basketCode === null ? '' : ` data-productcode="${o.basketCode ?? '21048'}"`, ' data-colorname="Siyah"',
    amount === null ? '' : ` data-productamount="${amount}"`,
    o.basketProductId === null ? '' : ` data-productID="${o.basketProductId ?? BSL_PRODUCT_ID}"`, ' data-Quantity="60"> SEPETE EKLE </button>',
    '<input type="hidden" id="ColorCode" value="02" /> </div> </div>', o.inBlock ?? '', '</div>',
  ].join(' ');
}

export function bslPage(o: BslPage = {}): string {
  const url = o.url ?? BSL_URL;
  const price = o.price ?? '1149.99';
  const amount = o.amount === undefined ? price.replace('.', ',') : o.amount;
  const availability = o.availability === undefined ? 'InStock' : o.availability;
  const offer = { '@type': 'Offer', ...(o.offerUrl === null ? {} : { url: o.offerUrl ?? url }), priceCurrency: 'TRY', price,
    ...(availability === null ? {} : { availability: `https://schema.org/${availability}` }), itemCondition: 'https://schema.org/NewCondition' };
  const product = { '@context': 'https://schema.org', '@type': 'Product', name: 'Toka Ve Drape Detaylı Midi Etek',
    ...(o.sku === null ? {} : { sku: o.sku ?? '21048-175' }), offers: offer };
  const canonical = o.canonical === undefined ? url : o.canonical;
  return [
    '<!DOCTYPE html><html lang="tr"><head>', canonical === null ? '' : `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:url" content="${url}" /><script type="application/ld+json">${o.schema ?? JSON.stringify(product)}</script></head>`,
    `<body class="tr ProductDetails TR${o.bodyClass ? ` ${o.bodyClass}` : ''}"> <div id="NewPd" class="row ProductDetail Midi-Boy-Etek NewPD">`,
    '<div class="col-24 col-sm-24 col-md-24 col-lg-11 col-xl-8 ProductOptions">',
    Array.from({ length: o.blocks ?? 1 }, () => productContent(o, amount)).join(''), '</div>',
    '<div class="col-lg-24 SuggestedProductsContainer"> <div class="row AutoGetLastVisited"></div> </div> </div>',
    o.tail ?? '',
    '<div id="NotifyModal" class="modal fade modal-wide in"><div class="modal-dialog"><div class="modal-content"><div class="modal-body"></div></div></div></div>',
    '<footer><div class="FooterLinks"></div></footer>',
    o.pageId === null ? '' : `<input type="hidden" id="PID" name="PID" value="${o.pageId ?? BSL_PRODUCT_ID}" />`,
    `<input type="hidden" id="prtkl" value="${url}" /></body></html>`,
  ].join(' ');
}

// Suggested products, a modal and similar page furniture carrying a whole size list and
// ids of their own; none of it is the product's block.
export const bslElsewhere = (inside: string) => [
  `<div class="SuggestedProductsContainer"><div class="row AutoGetLastVisited">${inside}</div></div>`,
  `<div id="GetCombineDetailsModal" class="modal fade modal-wide in"><div class="modal-dialog">${inside}</div></div>`,
  `<div class="find-table-size">${inside}</div>`,
  `<template>${inside}</template>`,
  `<!-- ${inside} -->`,
];
