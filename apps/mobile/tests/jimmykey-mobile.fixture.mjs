// The jimmykey.com colour page as a phone renders it, built from the desktop fixture
// (apps/api/.../jimmykey.fixture.ts, the page fetched 2026-09-22). Observed 2026-09-27 on the
// test phone (Xiaomi 14T Pro WebView) and again in a 375 px Android Chrome view of the same page
// (claude-yamalar/2026-09-27-duzeltmeler/kanit/jk-mobil-dom-2026-09-27.md): after the store's
// own scripts run, the product block keeps its product id, colour ids and sizes, but its active
// colour row and its add-to-bag button are moved out to one sticky bar at the end of <body>. The
// bar holds the colour row (one active colour), the add-to-bag slot (the button, with the product
// code) and a colour pop-up with a second copy of the active colour. The saved static page has
// no bar at all. Everything built here other than that observed layout is made up.
const fixture = await import(new URL('../../api/src/lib/price-tracking/jimmykey.fixture.ts', import.meta.url).href);
const { JIMMYKEY_URL, JIMMYKEY_CODE, JIMMYKEY_PRODUCT_ID, jimmykeyPage } = fixture;

const once = (text, pattern, replacement) => {
  let count = 0;
  const out = text.replace(pattern, (...match) => { count++; return typeof replacement === 'function' ? replacement(...match) : replacement; });
  if (count !== 1) throw new Error(`The desktop fixture changed: ${pattern} matched ${count} times`);
  return out;
};

// An active colour as the bar and the pop-up show it.
export const stickyColour = ({ id = '61', productId = JIMMYKEY_PRODUCT_ID, path = new URL(JIMMYKEY_URL).pathname, title = 'HAKI', popup = false, link = true } = {}) => [
  '<div class="ColorOptionItem color-item active">',
  link ? `<a title=${title} class=change-color href=${path} data-id=${id} data-name=HAKİ-312 data-global=Haki data-productid=${productId}><picture></picture></a>` : '',
  popup ? '<div class=product_page_sticky_button_colorOptions_popUp_productColorTitle><h4>haki</h4></div>' : '', '</div>',
].join('');

export const stickyBasket = (code = JIMMYKEY_CODE) => ['<button type=button name=Basket data-adding="Adding ..." id=Basket class="CartButtonColor NotSelected"',
  code === null ? '' : ` data-productcode=${code}`, ' data-amount=699.95><div class="BasketIcon hidden-md hidden-lg"></div>ADD TO BAG </button>'].join('');

// The bar as observed; `bar`, `popup` and `basket` are what each place holds, `extra` is put
// inside the bar after them.
export function stickyBar({ bar = [stickyColour()], popup = [stickyColour({ popup: true })], basket = [stickyBasket()], extra = '' } = {}) {
  return [
    '<div class=product_page_sticky_button_container><div class=product_page_sticky_button_content>',
    '<div class=product_page_sticky_button_top><div class=product_page_sticky_button_productName>Haki Boat Neck Long Sleeve Patterned Mesh Knitted Blouse</div></div>',
    '<div class=product_page_sticky_button_bottom><div class=product_page_sticky_button_colorOptions><div class="ItemColorsContainer product-colors"><div class="ColorOption color-option-wrapper">',
    bar.join(''), '</div></div><h4 class=colorOptions-count></h4></div>',
    '<div class="product_page_sticky_button_addToCard AddToBasket ProductDetails AutoTextRep">', basket.join(''), '</div></div></div>',
    '<div class=product_page_sticky_button_colorOptions_popUp><div class=product_page_sticky_button_colorOptions_popUp_title>',
    '<button class="colorOptions-close btn"><span class="glyphicon glyphicon-remove"></span></button><h4>Mevcut Renkler</h4></div>',
    '<div class="ItemColorsContainer product-colors"><div class="ColorOption color-option-wrapper">', popup.join(''), '</div></div></div>',
    extra, '</div>',
  ].join('');
}

// The desktop page (`page`, the haki/61 page by default) with the colour row and the add-to-bag
// button moved out of the product block (`keepInBlock` leaves them there as well) and the given
// bars appended to <body>. Where a colour has no button, the store's own script
// (productPage_sticky_script in its app.min.js: getElementById('Basket') ||
// getElementById('NotAdd')) moves the notify-me link out instead.
export function jimmykeyMobilePage({ bars = [stickyBar()], keepInBlock = false, page = jimmykeyPage, ...desktop } = {}) {
  let html = page(desktop);
  if (!keepInBlock) {
    html = once(html, /<div class=product-colors-wrapper>[\s\S]*?<\/div><\/div><\/div>(<\/div><\/div><div class="Sizes row">)/, (_, rest) => `<div class=ColorThumb></div>${rest}`);
    html = once(html, /<button type=button name=Basket id=Basket[^>]*>ADD TO BAG <\/button>|<a id=NotAdd [^>]*>[\s\S]*?<\/a>/, '');
  }
  return once(html, '<footer>', `${bars.join('')}<footer>`);
}
