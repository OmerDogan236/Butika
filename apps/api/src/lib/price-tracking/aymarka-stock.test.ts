import { afterEach, expect, test } from 'bun:test';
import { aymarkaPagePrice, aymarkaProduct, aymarkaStock, readAymarkaSelection } from './aymarka-stock';
import { extractProductHtml, extractProductPrice } from './extract-product-price';

const url = 'https://www.machka.com.tr/urun/dress';
const model = { id: 10, isApproved: true, isCompleted: true, routePath: 'dress', salesPrice: 100,
  barcodes: [{ id: 20, stockTypeValues: [{id: 1, name: '36'}] }, { id: 21, stockTypeValues: [{id: 2, name: '38'}] }] };
const page = (product: any = model) => `<script id="__NEXT_DATA__">${JSON.stringify({props:{pageProps:{data:{response:{isSuccess:true,product},route:{routeParts:{product:[{id:10,path:'dress'}]}}}}}})}</script><script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer","price":100,"priceCurrency":"TRY"}}</script>`;
const stock = () => ({isSuccess:true,data:{productId:10,stockAvailabilities:[{stockBarcodeId:20,isAvailable:true,stockTypeValueIds:[1]},{stockBarcodeId:21,isAvailable:false,stockTypeValueIds:[2]}]}});
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('displayed TL price must be unique and agree with the product model', () => {
  const html=page().split('<script type=')[0]!;
  const markup='<div data-test-id="product_price">100,00 TL</div>';
  expect(aymarkaPagePrice(html+markup,url)).toEqual({priceMinor:10000,currency:'TRY'});
  expect(aymarkaPagePrice(html+markup+markup,url)).toBeNull();
  expect(aymarkaPagePrice(html+markup.replace('100,00','90,00'),url)).toBeNull();
  expect(aymarkaPagePrice(html+markup.replace('TL','EUR'),url)).toBeNull();
  expect(extractProductHtml(html+markup,url+'?_butika_variant=aymarka:10:20')).toMatchObject({status:'success',priceMinor:10000,availability:'unknown'});
});

test('barcode stock is exact; mixed stock cannot stand for an unselected size', () => {
  const product = aymarkaProduct(page(),url,10000,'TRY')!;
  expect(product).not.toBeNull();
  expect(aymarkaStock(product,stock(),'20')).toBe('in_stock');
  expect(aymarkaStock(product,stock(),'21')).toBe('out_of_stock');
  expect(aymarkaStock(product,stock())).toBe('unknown');
  expect(aymarkaStock(product,stock(),'22')).toBe('unknown');
  const duplicate = stock(); duplicate.data.stockAvailabilities[1] = duplicate.data.stockAvailabilities[0]!;
  expect(aymarkaStock(product,duplicate,'20')).toBe('unknown');
  const wrong = stock(); wrong.data.stockAvailabilities[0]!.stockTypeValueIds=[2];
  expect(aymarkaStock(product,wrong,'20')).toBe('unknown');
  expect(aymarkaStock(product,{...stock(),data:{...stock().data,productId:11}},'20')).toBe('unknown');
  expect(aymarkaStock(product,{isSuccess:false},'20')).toBe('unknown');
});

test('route, price, domain and product identity must agree', () => {
  expect(aymarkaProduct(page(),url+'/wrong',10000,'TRY')).toBeNull();
  expect(aymarkaProduct(page(),url,9000,'TRY')).toBeNull();
  expect(aymarkaProduct(page(),url,10000,'EUR')).toBeNull();
  expect(aymarkaProduct(page(),'https://other.test/urun/dress',10000,'TRY')).toBeNull();
  expect(aymarkaProduct(page({...model,id:11}),url,10000,'TRY')).toBeNull();
  expect(aymarkaProduct(page({...model,isApproved:false}),url,10000,'TRY')).toBeNull();
  expect(extractProductHtml(page(),url+'?_butika_variant=aymarka:10:99').status).toBe('not_found');
  expect(extractProductHtml(page(),url+'?_butika_variant=aymarka:11:20').status).toBe('not_found');
  expect(readAymarkaSelection(url+'?_butika_variant=aymarka:10:20&_butika_variant=aymarka:10:21')?.variantId).toBe('');
});

test('scheduled extractor uses fresh public stock, strips private tracking parameter, and fails closed on outage', async () => {
  const requests: string[] = []; let outage = false;
  globalThis.fetch = (async (input: any) => { const target = String(input); requests.push(target);
    return target.includes('/api/') ? new Response(outage ? '{}' : JSON.stringify(stock()), {status:outage?500:200}) : new Response(page());
  }) as typeof fetch;
  expect(await extractProductPrice(url+'?_butika_variant=aymarka:10:20')).toMatchObject({status:'success',priceMinor:10000,availability:'in_stock',source:'aymarka'});
  expect(await extractProductPrice(url+'?_butika_variant=aymarka:10:21')).toMatchObject({status:'success',availability:'out_of_stock'});
  outage=true;
  expect(await extractProductPrice(url+'?_butika_variant=aymarka:10:20')).toMatchObject({status:'success',availability:'unknown'});
  expect(requests.every(u=>!u.includes('_butika_variant'))).toBe(true);
  expect(requests.filter(u=>u.includes('/api/')).every(u=>new URL(u).searchParams.get('productId')==='10')).toBe(true);
},15000);
