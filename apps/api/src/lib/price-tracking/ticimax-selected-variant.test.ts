import { expect, test } from 'bun:test';
import { extractTicimaxSelectedVariant, readTicimaxSelection } from './ticimax-selected-variant';
const url = 'https://store.test/dress-72';
const row = (id: number, stock: number, price = 100) => ({ id, urunKartiId: 72, aktif: true, stokAdedi: stock,
  urunFiyatiOrjinal: price, urunFiyatiOrjinalKDV: 10, paraBirimiKodu: 'TRY' });
const model = { productId: 72, productActive: true, productIsAsorti: false, productCurrency: 'TRY', totalStockAmount: 3,
  products: [row(1,0),row(2,3,200)], productVariantData: [{ urunKartID:72, urunID:1 },{ urunKartID:72, urunID:2 }] };
const page = (value: unknown = model) => `<link rel="canonical" href="${url}"><script>var productDetailModel = ${JSON.stringify(value)};</script>`;
test('exact Ticimax size has its own price and stock, even if other size differs', () => {
  expect(extractTicimaxSelectedVariant(page(),url,'72','1')).toEqual({priceMinor:11000,currency:'TRY',availability:'out_of_stock'});
  expect(extractTicimaxSelectedVariant(page(),url,'72','2')).toEqual({priceMinor:21000,currency:'TRY',availability:'in_stock'});
});
test('internal identity is stripped before retailer requests and duplicate identities rejected', () => {
  expect(readTicimaxSelection(`${url}?_butika_variant=ticimax:72:2`)).toEqual({sourceUrl:url,productId:'72',variantId:'2'});
  expect(readTicimaxSelection(`${url}?_butika_variant=ticimax:72:2&_butika_variant=ticimax:72:1`)?.variantId).toBe('');
});
test('selected size rejects other products, incomplete stock, unavailable identity and conditional pricing', () => {
  expect(extractTicimaxSelectedVariant(page(),url,'99','2')).toBeNull();
  expect(extractTicimaxSelectedVariant(page(),url,'72','99')).toBeNull();
  expect(extractTicimaxSelectedVariant(page(),'https://store.test/other','72','2')).toBeNull();
  expect(extractTicimaxSelectedVariant(page({...model,totalStockAmount:10}),url,'72','2')).toBeNull();
  expect(extractTicimaxSelectedVariant(page({...model,products:[row(1,0),{...row(2,3),urunKampanyaAktif:true}]}),url,'72','2')).toBeNull();
});
