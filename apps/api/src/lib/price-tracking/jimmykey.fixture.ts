// jimmykey.com product page, trimmed from the page fetched 2026-09-22 22:27Z
// (boat-neck mesh knitted blouse 5WW035617, colour haki/61, b92b1605…): the JSON-LD
// Product with one product-level Offer, the canonical, and the one `.ProductContent`
// block holding the hidden product id, the colour (ColorID, CurrentColorId, the active
// colour link), the size list (S on sale; M, L and XL sold out: span.outer + noStockLine +
// "Notify Me"), the add-to-bag button with the product code and amount, the favourite
// button with the product id, code and amount, the size chart,
// the description (mannequin size) and the store-stock search. Around it: the page's
// footer product id and its empty second ColorID. Test data only: every other price,
// stock state, colour or product built from it is made up.
export const JIMMYKEY_URL = 'https://www.jimmykey.com/en/-boat-neck-long-sleeve-patterned-mesh-knitted-blouse_5ww035617/haki/61';
export const JIMMYKEY_CODE = '5WW035617';
export const JIMMYKEY_PRODUCT_ID = '28615';
const PATH = '/en/-boat-neck-long-sleeve-patterned-mesh-knitted-blouse_5ww035617/haki/61';
const OTHER_COLOUR = '/en/-boat-neck-long-sleeve-patterned-mesh-knitted-blouse_5ww035617/black/12';
// The same product's other colour, as its own page. Made up: no black/12 page was saved.
export const JIMMYKEY_BLACK_URL = `https://www.jimmykey.com${OTHER_COLOUR}`;

// A chosen size as the app saves it: jimmykey:<ProductID>:<ColorID>:<SizeID> on the colour page.
export const selectedUrl = (sizeId: string, o: { productId?: string; colourId?: string; page?: string } = {}) =>
  `${o.page ?? JIMMYKEY_URL}?_butika_variant=${encodeURIComponent(`jimmykey:${o.productId ?? JIMMYKEY_PRODUCT_ID}:${o.colourId ?? '61'}:${sizeId}`)}`;

export type JimmykeyPageSize = { id: string; label: string; onSale: boolean };
// The page of 2026-09-22 as fetched: one size on sale, three sold out.
export const JIMMYKEY_SIZES: JimmykeyPageSize[] = [
  { id: '71', label: 'S', onSale: true }, { id: '86', label: 'M', onSale: false },
  { id: '75', label: 'L', onSale: false }, { id: '80', label: 'XL', onSale: false },
];
export const everySize = (onSale: boolean) => JIMMYKEY_SIZES.map(size => ({ ...size, onSale }));

export type JimmykeyPage = {
  url?: string; price?: string; availability?: string | null; sizes?: JimmykeyPageSize[]; sizeList?: string;
  canonical?: string | null; sku?: string | null; offerUrl?: string | null; schema?: string;
  productId?: string | null; pageId?: string | null; colourId?: string | null; currentColourId?: string | null;
  activeColour?: string; activeProductId?: string; activeHref?: string; activeColours?: number; otherColour?: { id: string; path: string };
  basketCode?: string | null; basketAmount?: string | null;
  blocks?: number; inBlock?: string; tail?: string; bodyClass?: string;
  // The product the page is about, wherever an option above does not say otherwise.
  product?: { id: string; code: string };
  // The block's add-to-bag place: the button (basket: false leaves it out) and, where a
  // colour is sold out in every size, the notify-me link (notify) the store renders there.
  basket?: boolean; notify?: JimmykeyNotify | null;
  // The block's favourite button, next to the add-to-bag place; null leaves it out.
  favourite?: JimmykeyFavourite | null;
};
export type JimmykeyNotify = { productId?: string | null; colourId?: string | null; className?: string };
export type JimmykeyFavourite = { tag?: string; id?: string | null; code?: string | null; amount?: string | null };

export const jimmykeySizeLink = (size: JimmykeyPageSize) =>
  `<a data-id=${size.id} class=${size.label} data-name=${size.label} data-stock=${size.onSale ? 'True' : 'False'} href=javascript:void(0)>${size.label}</a>`;
export const jimmykeySoldOut = (size: Pick<JimmykeyPageSize, 'id' | 'label'>) => [
  `<span class=outer> <input type=hidden name=SizeIDs id=SizeIDs value=${size.id}> <span class=inner>${size.label}</span> <span class=noStockLine></span>`,
  '<span class=PdHint> <span class=PdHint-content> <a href=# class=NotifyWhen> <span>Notify Me</span> </a> </span> </span> </span>',
].join(' ');
export const jimmykeySizeList = (sizes: JimmykeyPageSize[], extra = '') => [
  '<div class="col-lg-18 col-md-24 col-xs-24 SizeOptions"><div id=SelectSizePopup><span>Please choose a Size</span></div>',
  sizes.map(size => size.onSale ? jimmykeySizeLink(size) : jimmykeySoldOut(size)).join(' '), extra, '</div>',
].join('');

// The notify-me link and the favourite button as the white/518 page below renders them
// (fetched 2026-09-27), with only the attributes read here.
export const jimmykeyNotifyLink = (o: JimmykeyNotify = {}) => [
  `<a id=NotAdd class="${o.className ?? 'CartButtonColor RemindMe'}"`, o.productId === null ? '' : ` data-productid=${o.productId ?? JIMMYKEY_PRODUCT_ID}`,
  o.colourId === null ? '' : ` data-colorid=${o.colourId ?? '61'}`, '><div class="BasketIcon hidden-md hidden-lg"></div>NOTIFY ME </a>',
].join('');
export const jimmykeyFavourite = (o: JimmykeyFavourite = {}) => [
  `<${o.tag ?? 'button'} class="AddToFavorite passiveFavorite"`, o.id === null ? '' : ` data-id=${o.id ?? JIMMYKEY_PRODUCT_ID}`,
  o.code === null ? '' : ` data-productcode=${o.code ?? JIMMYKEY_CODE}`, o.amount === null ? '' : ` data-amount=${o.amount ?? '699.95'}`,
  `> </${o.tag ?? 'button'}>`,
].join('');

const hidden = (id: string, value: string | null | undefined) => value === null || value === undefined ? '' : `<input type=hidden id=${id} name=${id} value=${value}>`;

function productContent(o: JimmykeyPage, price: string): string {
  const colour = o.colourId === undefined ? '61' : o.colourId;
  const id = o.product?.id ?? JIMMYKEY_PRODUCT_ID;
  const code = o.product?.code ?? JIMMYKEY_CODE;
  const activeColour = [
    '<div class="ColorOptionItem color-item active">',
    `<a title=HAKI class=change-color href=${o.activeHref ?? PATH} data-id=${o.activeColour ?? '61'} data-name=HAKİ-312 data-global=Haki data-productid=${o.activeProductId ?? id}>`,
    '<picture></picture></a></div>',
  ].join('');
  return [
    '<div class=ProductContent><div class=row><div class="col-xs-24 col-sm-24"><h1 class=ProductHeader>Haki Boat Neck Long Sleeve Patterned Mesh Knitted Blouse</h1>',
    `<div class="hidden-md hidden-lg AddToFavorite passiveFavorite" data-id=${id}></div>`,
    hidden('ProductID', o.productId === undefined ? id : o.productId), '<input type=hidden id=CurColor value=Haki>',
    hidden('CurrentColorId', o.currentColourId === undefined ? colour : o.currentColourId),
    `<div class=Prices><span class="Price DiscountedAmount"> ₺${price} </span></div></div></div>`,
    `<div class="row Colors"><div class="col-md-20 clrs">${hidden('ColorID', colour)}<div class=product-colors-wrapper>`,
    '<div class="ItemColorsContainer product-colors"><div class="ColorOption color-option-wrapper">',
    Array.from({ length: o.activeColours ?? 1 }, () => activeColour).join(''),
    `<div class="ColorOptionItem color-item"><a title=BLACK class=change-color href=${o.otherColour?.path ?? OTHER_COLOUR} data-id=${o.otherColour?.id ?? '12'} data-productid=${id}><picture></picture></a></div>`,
    '</div></div></div></div></div>',
    '<div class="Sizes row"><div class="SizeAndAmount row"><input type=hidden id=SizeID name=SizeID>',
    '<div class="LastProducts More"><span class=LastText>Last</span></div>',
    o.sizeList ?? jimmykeySizeList(o.sizes ?? JIMMYKEY_SIZES), '</div>',
    '<div class="row BasktButtons"><div class="col-md-15 col-xs-24"><div class="AddToBasket ProductDetails AutoTextRep">',
    o.basket === false ? '' : [
      '<button type=button name=Basket id=Basket class="CartButtonColor NotSelected"',
      o.basketCode === null ? '' : ` data-productcode=${o.basketCode ?? code}`,
      o.basketAmount === null ? '' : ` data-amount=${o.basketAmount ?? price}`, '>ADD TO BAG </button>',
    ].join(''),
    o.notify ? jimmykeyNotifyLink({ productId: id, colourId: colour, ...o.notify }) : '', '</div></div>',
    o.favourite === null ? '' : `<div class="col-md-3 col-md-offset-1 col-xs-24 hidden-xs hidden-sm">${jimmykeyFavourite({ id, code, amount: price, ...o.favourite })}</div>`,
    '<div class=PDetailExtra><div class="SizeTable col-md-8 col-xs-12"><span>Size Chart</span></div></div></div></div>',
    '<div class=panel id=panel2><div id=PrdInfo class="panel-body collapse in"><div class=ProductAttiributes><span class=ManikinSize>S</span></div>',
    `<div class=store-stock-info data-productcode=${code}></div></div></div>`,
    '<div class="panel-heading StoreStock"><div id=StoreStockOptionsDetail><select class=form-control name=BedenMagazaAra>',
    '<option value="">Size</option><option value=71>S</option><option value=86>M</option></select></div></div>',
    o.inBlock ?? '', '</div>',
  ].join('');
}

export function jimmykeyPage(o: JimmykeyPage = {}): string {
  const url = o.url ?? JIMMYKEY_URL;
  const price = o.price ?? '699.95';
  const availability = o.availability === undefined ? 'InStock' : o.availability;
  const offer = { '@type': 'Offer', price: Number(price), priceCurrency: 'TRY',
    ...(availability === null ? {} : { availability: `https://schema.org/${availability}` }),
    ...(o.offerUrl === null ? {} : { url: o.offerUrl ?? url }) };
  const product = { '@context': 'https://schema.org', '@type': 'Product', name: 'Boat Neck Long Sleeve Patterned Mesh Knitted Blouse',
    ...(o.sku === null ? {} : { sku: o.sku ?? o.product?.code ?? JIMMYKEY_CODE }), offers: offer };
  const canonical = o.canonical === undefined ? url : o.canonical;
  return [
    '<html><head>', canonical === null ? '' : `<link rel=canonical href=${canonical}>`,
    `<script type=application/ld+json>${o.schema ?? JSON.stringify(product)}</script></head>`,
    `<body class="en ProductDetails Index${o.bodyClass ? ` ${o.bodyClass}` : ''}"><div id=NewPd class="row ProductDetail Blouses NewPD">`,
    '<div id=ProductDetailDivi class="col-md-24 product-image-wrapper"><div class="col-sm-24 col-md-9 ProductOptions product-content-wrapper">',
    Array.from({ length: o.blocks ?? 1 }, () => productContent(o, price)).join(''), '</div></div></div>',
    o.tail ?? '',
    '<footer><div class=sorsware></div></footer>',
    o.pageId === null ? '' : `<input id=PID type=hidden name=PID value=${o.pageId ?? o.product?.id ?? JIMMYKEY_PRODUCT_ID}> `,
    '<input id=ColorID type=hidden name=ColorID> <input id=LangID type=hidden name=LangID value=2></body></html>',
  ].join('');
}

// The black/12 page of the same product (made up from the haki/61 page): the same product
// id and size ids, its own colour, and haki/61 as the other colour.
export const jimmykeyBlackPage = (o: JimmykeyPage = {}) => jimmykeyPage({ url: JIMMYKEY_BLACK_URL, colourId: '12', activeColour: '12',
  activeHref: OTHER_COLOUR, otherColour: { id: '61', path: PATH }, ...o });

// Another product's colour page with every size sold out: 6SW187118 (ProductID 29580) in
// white/518, fetched 2026-09-27 17:37:15Z with the reader's own request (kept outside this
// repository). Its address, product id and code, colour, five sizes with their ids (every one a
// sold-out "Notify Me" entry), price (the JSON-LD's ₺1699.95, still InStock), notify-me link and
// favourite button are that page's. The page has no add-to-bag button: the notify-me link
// a#NotAdd.RemindMe, carrying the product id and the colour id but no product code, sits in the
// button's place, and the block's favourite button carries the product id, the code and the
// amount. The rest of the markup is the 2026-09-22 page's template.
const SOLD_OUT_PATH = '/en/100-cotton-high-waist-denim-pants_6sw187118/white/518';
export const JIMMYKEY_SOLD_OUT_URL = `https://www.jimmykey.com${SOLD_OUT_PATH}`;
export const JIMMYKEY_SOLD_OUT_PRODUCT = { id: '29580', code: '6SW187118' };
export const JIMMYKEY_SOLD_OUT_SIZES: JimmykeyPageSize[] = [
  { id: '116', label: '34', onSale: false }, { id: '87', label: '36', onSale: false }, { id: '79', label: '38', onSale: false },
  { id: '77', label: '40', onSale: false }, { id: '119', label: '42', onSale: false },
];
export const jimmykeySoldOutPage = (o: JimmykeyPage = {}) => jimmykeyPage({ url: JIMMYKEY_SOLD_OUT_URL, product: JIMMYKEY_SOLD_OUT_PRODUCT,
  price: '1699.95', colourId: '518', activeColour: '518', activeHref: SOLD_OUT_PATH,
  otherColour: { id: '83', path: '/en/100-cotton-high-waist-denim-pants_6sw187118/blue/83' },
  sizes: JIMMYKEY_SOLD_OUT_SIZES, basket: false, notify: {}, ...o });

// A recommendation card, a modal and similar page furniture carrying a whole size list of
// their own; none of it is the product's block.
export const jimmykeyElsewhere = (inside: string) => [
  `<div class=personaclick-recommend><div class=recommended-items><div class=recommended-item-container>${inside}</div></div></div>`,
  `<div id=CombineItemsModal class="popup modal fade"><div class=modal-dialog>${inside}</div></div>`,
  `<div class=AutoGetLastVisited>${inside}</div>`,
  `<div class=AddToBasketFixed>${inside}</div>`,
  `<template>${inside}</template>`,
  `<!-- ${inside} -->`,
];
