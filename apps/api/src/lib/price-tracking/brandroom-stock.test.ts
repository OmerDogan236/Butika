import {afterEach,expect,test} from 'bun:test';
import {brandroomFixture} from './brandroom.fixture';
import {brandroomProduct,brandroomStock,readBrandroomSelection} from './brandroom-stock';
import {extractProductHtml,extractProductPrice} from './extract-product-price';
const original=globalThis.fetch;
afterEach(()=>{globalThis.fetch=original;});
test('Brandroom binds a scoped price to the product form and complete supported choices',()=>{
 const f=brandroomFixture(),p=brandroomProduct(f.html,f.url)!;
 expect(p.priceMinor).toBe(10000);
 expect(brandroomProduct(f.html,f.url+'-other')).toBeNull();
 expect(brandroomProduct(f.html.replace('"HasCondition":false','"HasCondition":true'),f.url)).toBeNull();
 expect(brandroomProduct(f.html.replace('"PriceAdjustmentValue":0','"PriceAdjustmentValue":5'),f.url)).toBeNull();
 expect(brandroomProduct(f.html+f.html,f.url)).toBeNull();
 expect(extractProductHtml(f.html,f.selectedUrl.replace(f.valueId,'f'.repeat(24))).status).toBe('not_found');
 expect(readBrandroomSelection(f.selectedUrl+'&_butika_variant=offer:other')?.variantId).toBe('');
});
test('stock cannot borrow another size, price, reservation or backorder',()=>{
 const f=brandroomFixture(),p=brandroomProduct(f.html,f.url)!;
 expect(brandroomStock(p,f.valueId,f.response)).toBe('in_stock');
 expect(brandroomStock(p,f.valueId,brandroomFixture(100,false).response)).toBe('out_of_stock');
 expect(brandroomStock(p,f.otherId,f.response)).toBe('unknown');
 expect(brandroomStock(p,f.valueId,brandroomFixture(90).response)).toBe('unknown');
 for(const change of [{ReservedQuantity:1},{StockQuantity:-1},{AllowOutOfStockOrders:true},{Sku:'OTHER'},{Attributes:[]}])expect(brandroomStock(p,f.valueId,{...f.response,selectedProductAttributeCombination:{...f.response.selectedProductAttributeCombination,...change}})).toBe('unknown');
});
test('scheduler parser sends only the chosen size and stock outages stay unknown',async()=>{
 const f=brandroomFixture();let outage=false;const requests:{url:string;body:FormData|null}[]=[];
 globalThis.fetch=(async(input:any,init:any)=>{const u=String(input);requests.push({url:u,body:init?.body??null});return u.includes('attributechange')?new Response(JSON.stringify(outage?{}:f.response)):new Response(f.html);}) as typeof fetch;
 expect(await extractProductPrice(f.selectedUrl)).toMatchObject({status:'success',priceMinor:10000,availability:'in_stock'});
 const api=requests.find(r=>r.body)!;
 expect(api.body!.get('product_attribute_'+f.attribute.Id)).toBe(f.valueId);
 expect(requests.every(r=>!r.url.includes('_butika_variant'))).toBe(true);
 outage=true;expect(await extractProductPrice(f.selectedUrl)).toMatchObject({status:'success',availability:'unknown'});
 expect(await extractProductPrice(f.url)).toMatchObject({status:'success',availability:'unknown'});
});
