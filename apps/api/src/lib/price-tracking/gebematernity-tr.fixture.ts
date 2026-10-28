// gebematernity.com keeps each language in its own directory (/tr/…). Fetched from
// Türkiye on 2026-10-11:
//   /wp-json/wc/store/v1/products?slug=hamile-elbisesi-lalin     -> 200, []
//   /tr/wp-json/wc/store/v1/products?slug=hamile-elbisesi-lalin  -> 200, the product below
// The answer is trimmed to the fields the reader uses; descriptions, images and
// categories are removed and no value is changed. The product page itself states
// "price":"0.00" in its JSON-LD, so the Store API is the only place the price is given.
export const GEBE_LALIN_URL = 'https://gebematernity.com/tr/product/hamile-elbisesi-lalin/';
export const GEBE_LALIN_ROOT_ENDPOINT = 'https://gebematernity.com/wp-json/wc/store/v1/products?slug=hamile-elbisesi-lalin';
export const GEBE_LALIN_TR_ENDPOINT = 'https://gebematernity.com/tr/wp-json/wc/store/v1/products?slug=hamile-elbisesi-lalin';

export const GEBE_LALIN_ROOT_ANSWER = '[]';

export const GEBE_LALIN_TR_ANSWER = `[{"id":41877,"name":"Hamile Elbisesi Lalin","slug":"hamile-elbisesi-lalin","parent":0,"type":"variable","variation":"","permalink":"https://gebematernity.com/tr/product/hamile-elbisesi-lalin/","sku":"G9015209","on_sale":false,"prices":{"price":"77935","regular_price":"0","sale_price":"0","price_range":null,"currency_code":"TRY","currency_symbol":"₺","currency_minor_unit":2,"currency_decimal_separator":",","currency_thousand_separator":".","currency_prefix":"","currency_suffix":"₺"},"variations":[],"has_options":true,"is_purchasable":true,"is_in_stock":true,"is_on_backorder":false,"low_stock_remaining":null,"stock_availability":{"text":"Stokta yok","class":"out-of-stock"},"sold_individually":false}]`;
