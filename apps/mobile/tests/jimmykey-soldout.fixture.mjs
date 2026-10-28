import { jimmykeyMobilePage, stickyBar, stickyColour } from './jimmykey-mobile.fixture.mjs';

// A jimmykey.com colour sold out in every size, as a phone renders it. Observed and made-up
// markup are kept apart.
//
// OBSERVED, copied verbatim from the test phone's WebView (Xiaomi 14T Pro, 2026-09-27 00:57:58Z,
// DevTools, read only) on white/518 of 6SW187118 (ProductID 29580), every size "Notify Me"
// (claude-yamalar/2026-09-27-dar-kapsam/jk-tukenmis/telefon-dom-2026-09-27T005758Z.json):
// - the sticky bar's add-to-bag slot, holding the notify-me link the store's script moved there
//   from the product block (there is no add-to-bag button on this page);
// - the product block's favourite button, left in the block, with the product id and code.
export const OBSERVED_SLOT = '<div class="product_page_sticky_button_addToCard AddToBasket ProductDetails AutoTextRep"><a id="NotAdd" class="CartButtonColor RemindMe" data-productid="29580" data-colorid="518"><div class="BasketIcon hidden-md hidden-lg"></div>NOTIFY ME </a></div>';
export const OBSERVED_FAVOURITE = '<button class="AddToFavorite passiveFavorite" data-id="29580" data-productcode="6SW187118" data-productname="100% Cotton High Waist Denim Pants" data-colorname="KIRIK BEYAZ" data-amount="1699.95" data-amountpsf="2999.95" data-category1="Clothing" data-category2="Bottoms" data-category3="Pants" data-catid="25" data-itemlistname="Pantolon" data-quantity=""> </button>';
export const OBSERVED_NOTIFY = OBSERVED_SLOT.slice(OBSERVED_SLOT.indexOf('<a '), OBSERVED_SLOT.lastIndexOf('</div>'));

// MADE UP, everything below: the page around those two pieces is the API fixture's white/518
// page (jimmykeySoldOutPage, trimmed from the server body fetched 2026-09-27 17:37:15Z) in the
// phone layout of jimmykey-mobile.fixture.mjs, and every variation the tests pass in is invented.
const fixture = await import(new URL('../../api/src/lib/price-tracking/jimmykey.fixture.ts', import.meta.url).href);
const { JIMMYKEY_SOLD_OUT_URL, JIMMYKEY_SOLD_OUT_PRODUCT: PRODUCT, jimmykeyFavourite, jimmykeySoldOutPage } = fixture;
const PATH = new URL(JIMMYKEY_SOLD_OUT_URL).pathname;

// The bar the fixtures build around the observed link is the observed slot, byte for byte.
if (!stickyBar({ basket: [OBSERVED_NOTIFY] }).includes(OBSERVED_SLOT)) throw new Error('The sticky bar no longer holds the observed slot');

export const whiteColour = (o = {}) => stickyColour({ id: '518', productId: PRODUCT.id, path: PATH, title: 'WHITE', ...o });
// A made-up notify-me link or favourite button, quoted like the observed ones.
export const notifyLink = ({ productId = PRODUCT.id, colourId = '518', className = 'CartButtonColor RemindMe' } = {}) =>
  `<a id="NotAdd" class="${className}" data-productid="${productId}" data-colorid="${colourId}"><div class="BasketIcon hidden-md hidden-lg"></div>NOTIFY ME </a>`;
export const favourite = ({ tag = 'button', id = PRODUCT.id, code = PRODUCT.code } = {}) =>
  `<${tag} class="AddToFavorite passiveFavorite" data-id="${id}" data-productcode="${code}" data-amount="1699.95"> </${tag}>`;

// The white/518 page as the phone shows it: the notify-me link moved to the bar's slot, the
// white colour in the bar's row and pop-up, the observed favourite button in the block.
// `slot`, `bar`, `popup` and `extra` are what the bar holds; `bars` replaces the bar;
// `favouriteMarkup` replaces the block's favourite button; the rest goes to the server page.
export function soldOutPhonePage({ slot = [OBSERVED_NOTIFY], bar = [whiteColour()], popup = [whiteColour({ popup: true })], extra = '', bars,
  favouriteMarkup = OBSERVED_FAVOURITE, ...server } = {}) {
  const html = jimmykeyMobilePage({ page: jimmykeySoldOutPage, bars: bars ?? [stickyBar({ bar, popup, basket: slot, extra })], ...server });
  const trimmed = jimmykeyFavourite({ id: PRODUCT.id, code: PRODUCT.code, amount: '1699.95' });
  if (!html.includes(trimmed)) throw new Error('The server page no longer holds its favourite button');
  return html.replace(trimmed, favouriteMarkup);
}
