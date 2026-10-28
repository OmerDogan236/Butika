import {afterEach,expect,test} from 'bun:test';
import {parseModanisaProduct,modanisaObservation} from './modanisa-product';
import {parseWooSelection} from './woo-selected-product';
import {scopedMicrodataPrice} from './scoped-microdata-price';
import {extractProductPrice} from './extract-product-price';
const original=globalThis.fetch;afterEach(()=>{globalThis.fetch=original;});
const url='https://www.modanisa.com/blue-skirt.html';
const product=()=>({id:'100',price:{symbol:'TL',sellPrice:'1.779,99 TL',smallText:'Coupon 1 TL'},colors:[{productId:'100',sef:url,sizes:[{sku:'200',name:'38',quantity:3},{sku:'201',name:'40',quantity:0}]}]});
test('Modanisa requires matching country currency, canonical color, exact SKU and valid quantity',()=>{
 expect(parseModanisaProduct(product(),url)?.availability).toBe('unknown');
 expect(parseModanisaProduct(product(),url+'?_butika_variant=modanisa:100:200')).toMatchObject({priceMinor:177999,currency:'TRY',availability:'in_stock'});
 expect(parseModanisaProduct(product(),url+'?_butika_variant=modanisa:100:201')?.availability).toBe('out_of_stock');
 expect(parseModanisaProduct(product(),url+'?_butika_variant=modanisa:101:200')).toBeNull();
 expect(parseModanisaProduct(product(),url+'?_butika_variant=modanisa:100:299')).toBeNull();
 const p=product();p.price.symbol='EUR';expect(parseModanisaProduct(p,url)).toBeNull();
 const bad=product();bad.colors[0]!.sizes[0]!.quantity=-1;expect(parseModanisaProduct(bad,url)).toBeNull();
 expect(parseModanisaProduct(product(),'https://www.modanisa.com/red-skirt.html')).toBeNull();
});
test('Modanisa uses explicit Turkey context and refuses HTML fallback on service failure',async()=>{
 let offline=false;const requests:any[]=[];
 globalThis.fetch=(async(u:any,init:any)=>{requests.push({u:String(u),init});return String(u).includes('pd-bff')?new Response(JSON.stringify(offline?{}:product())):new Response('<html></html>');}) as typeof fetch;
 expect(await modanisaObservation(url+'?_butika_variant=modanisa:100:200',AbortSignal.timeout(1000))).toMatchObject({availability:'in_stock'});
 expect(requests[0].init.headers).toMatchObject({'accept-language':'tr','x-display-currency':'TRY','x-shipping-country-code':'TR','x-shipping-country-code-alpha3':'TUR'});
 offline=true;expect((await extractProductPrice(url+'?_butika_variant=modanisa:100:200')).status).toBe('not_found');
});
test('Woo exact variation cannot borrow another parent, stock or price unit',()=>{
 const u='https://shop.example/dress?_butika_variant=woo:10:20',parent={id:10,type:'variable',permalink:'https://shop.example/dress',variations:[{id:20},{id:21}]};
 const v={id:20,parent:10,type:'variation',permalink:'https://shop.example/dress?attribute_size=38',prices:{currency_code:'TRY',currency_minor_unit:2,price:'10000',price_range:null},is_in_stock:true,is_purchasable:true,is_on_backorder:false,stock_availability:{class:'in-stock'}};
 expect(parseWooSelection(parent,v,u)).toMatchObject({priceMinor:10000,availability:'in_stock'});
 expect(parseWooSelection(parent,{...v,is_in_stock:false},u)?.availability).toBe('out_of_stock');
 expect(parseWooSelection(parent,{...v,parent:99},u)).toBeNull();
 expect(parseWooSelection(parent,{...v,id:21},u)).toBeNull();
 expect(parseWooSelection(parent,{...v,permalink:'https://shop.example/other'},u)).toBeNull();
 expect(parseWooSelection(parent,{...v,prices:{...v.prices,currency_minor_unit:0}},u)).toBeNull();
 expect(parseWooSelection(parent,{...v,is_on_backorder:true},u)?.availability).toBe('unknown');
});
test('unquoted HTML attributes are parsed within one canonical product offer',()=>{
 const u='https://shop.example/dress',h=`<link rel=canonical href=${u}><div itemscope itemtype=https://schema.org/Product><div itemprop=offers itemscope itemtype=https://schema.org/Offer><meta itemprop=price content=100.25><meta itemprop=priceCurrency content=TRY></div></div>`;
 expect(scopedMicrodataPrice(h,u)).toEqual({priceMinor:10025,currency:'TRY'});
 expect(scopedMicrodataPrice(h,u+'/other')).toBeNull();
 expect(scopedMicrodataPrice(h+h,u)).toBeNull();
 expect(scopedMicrodataPrice(h.replace('100.25','0'),u)).toBeNull();
 expect(scopedMicrodataPrice(h.replace('100.25','100.255'),u)).toBeNull();
});
