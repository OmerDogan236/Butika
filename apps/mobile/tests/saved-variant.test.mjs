import { test, expect } from 'bun:test';
import vm from 'node:vm';
import { findSavedVariant, readVariants, singleVariantSave, variantCaptureScript, variantUrl } from '../src/lib/saved-variant.ts';

const metadata = `(function(){var payload={kind:'og',url:location.href,title:'Dress'};window.ReactNativeWebView.postMessage(JSON.stringify(payload));})(); true;`;
const variants = [{ id: '123', title: 'S / Blue', available: true }, { id: '456', title: 'M / Blue', available: false }];

test('a retailer stripping internal parameters preserves one exact visible size, never another selection',()=>{
 const saved=[{id:'saved36',url:'https://shop.example/dress?Beden=36&_butika_variant=offer:BLUE_36'}];
 expect(findSavedVariant(saved,'https://shop.example/dress?Beden=36')?.id).toBe('saved36');
 expect(findSavedVariant(saved,'https://shop.example/dress?Beden=38')).toBeUndefined();
 expect(findSavedVariant(saved,'https://shop.example/dress?Beden=36&_butika_variant=offer:BLUE_38')).toBeUndefined();
 const ambiguous=[{url:'https://shop.example/dress?_butika_variant=ticimax:1:2'},{url:'https://shop.example/dress?_butika_variant=ticimax:1:3'}];
 expect(findSavedVariant(ambiguous,'https://shop.example/dress')).toBeUndefined();
});

async function capture({ path = '/products/dress', hostname = 'shop.example', shopify = true, fail = false, navigate = false, ticimax, next, modernIkas, schema, brandroom, responseProduct, woo = false } = {}) {
  const messages = [];
  const location = { hostname, pathname: path, href: `https://${hostname}${path}` };
  let endpoint;
  const context = {
    location, URL, AbortController, setTimeout, clearTimeout,
    document: { body: {classList:{contains: name=>woo&&name==='woocommerce'}}, querySelector: () => next ? { textContent: JSON.stringify(next) } : null,
      querySelectorAll: selector => !schema ? [] : selector.startsWith('script') ? [{textContent:JSON.stringify(schema)}] : [{href:location.href}] },
    window: { standardProductAttributes:brandroom, __IKAS_DATA__:modernIkas, productDetailModel: ticimax, ...(shopify ? { Shopify: {} } : {}), ReactNativeWebView: { postMessage: text => messages.push(JSON.parse(text)) } },
    fetch: async url => {
      endpoint = url;
      if (navigate) location.href += '?changed=1';
      if (fail) throw new Error('Offline');
      return { ok: true, json: async () => responseProduct ?? ({ id: 1, handle: 'dress', variants }) };
    },
  };
  vm.runInNewContext(variantCaptureScript(metadata, 'gesture-1'), context);
  await new Promise(resolve => setTimeout(resolve, 0));
  return { messages, endpoint };
}

test('distinct sizes preserve distinct URLs, replacing an existing selection', () => {
  expect(variantUrl('https://shop.example/products/dress?variant=999&utm_source=x', '123')).toBe('https://shop.example/products/dress?variant=123&utm_source=x');
  expect(variantUrl('https://shop.example/products/dress', '123')).not.toBe(variantUrl('https://shop.example/products/dress', '456'));
  expect(() => variantUrl('javascript:alert(1)', '123')).toThrow();
});

test('malformed, duplicate or unknown-stock options cannot enter the picker', () => {
  expect(readVariants(variants)).toEqual(variants);
  for (const invalid of [null, [], [variants[0], variants[0]], [{ id: '1', title: 'S' }], [{ id: 1, title: 'S', available: true }]]) expect(readVariants(invalid)).toBeNull();
});

test('locale and collection URLs fetch the correct product and preserve all stock options', async () => {
  const result = await capture({ path: '/tr/collections/summer/products/dress' });
  expect(result.endpoint).toBe('/tr/products/dress.js');
  expect(result.messages[0].variants).toEqual(variants);
  expect(result.messages[0].requestId).toBe('gesture-1');
  expect(result.messages[0].variantStatus).toBe('ready');
});

test('Shopify read failure blocks implicit default-variant saving', async () => {
  expect((await capture({ fail: true })).messages[0].variantStatus).toBe('error');
});

test('unrelated stores retain metadata saving', async () => {
  expect((await capture({ shopify: false, path: '/dress.html' })).messages[0].variantStatus).toBeUndefined();
  expect((await capture({ shopify: false, path: '/dress.html', next: { unrelated: true } })).messages[0].variantStatus).toBeUndefined();
});

test('navigation during lookup discards the stale capture', async () => {
  expect((await capture({ navigate: true })).messages).toEqual([]);
});

test('Ticimax picker preserves product and size identity with readable option labels', async () => {
  const ticimax = { productId: 72, products: [{ id: 999, urunKartiId: 72, aktif: true, stokAdedi: 0 }, { id: 1, urunKartiId: 72, aktif: true, stokAdedi: 0 }, { id: 2, urunKartiId: 72, aktif: true, stokAdedi: 3 }],
    productVariantData: [{ urunID: 1, urunKartID: 72, ekSecenekTipiTanim: 'Beden', tanim: 'S' },{ urunID: 2, urunKartID: 72, ekSecenekTipiTanim: 'Beden', tanim: 'M' }] };
  const { messages } = await capture({ path: '/dress-72', shopify: false, ticimax });
  expect(messages[0].variants).toEqual([{id:'ticimax:72:1', title:'Beden: S', available:false},{id:'ticimax:72:2',title:'Beden: M',available:true}]);
  expect(readVariants(messages[0].variants)).not.toBeNull();
  expect(variantUrl('https://store.test/dress-72', 'ticimax:72:2')).toBe('https://store.test/dress-72?_butika_variant=ticimax%3A72%3A2');
});

test('IKAS selection preserves UUID and uses online stock locations only', async () => {
  const product='00000000-0000-0000-0000-000000000001', variant='00000000-0000-0000-0000-000000000002';
  const row={id:variant,productId:product,deleted:false,isActive:true,variantValues:[{name:'M'}],stocks:[{stockLocationId:'online',stockCount:0},{stockLocationId:'offline',stockCount:100}]};
  const next={props:{pageProps:{pageSpecificData:{id:product,metaData:{slug:'dress'},variantTypes:[],variants:[row,{...row,id:'00000000-0000-0000-0000-000000000003'}]},configJson:{stockLocationIds:['online']}}}};
  const {messages}=await capture({path:'/dress',shopify:false,next});
  expect(messages[0].variants[0].available).toBe(false);
  expect(readVariants(messages[0].variants)).not.toBeNull();
  const saved=new URL(variantUrl('https://store.test/dress',messages[0].variants[0].id));
  expect(saved.searchParams.get('vid')).toBe(variant);
  expect(saved.searchParams.get('_butika_variant')).toBe(`ikas:${product}:${variant}`);
  const modern=await capture({path:'/dress',shopify:false,modernIkas:{pageType:'PRODUCT',pageSpecificData:next.props.pageProps.pageSpecificData,storefrontConfig:next.props.pageProps.configJson}});
  expect(modern.messages[0].variants).toEqual(messages[0].variants);
});

test('SKU offers expose named sizes and preserve an explicit server-verifiable choice',async()=>{
 const offers=[{sku:'BLUE_36',availability:'https://schema.org/InStock'},{sku:'BLUE_38',availability:'https://schema.org/OutOfStock'}].map((o,i)=>({'@type':'Offer',url:`https://shop.example/products/dress?Beden=${36+i*2}`,...o}));
 const {messages}=await capture({shopify:false,schema:{'@type':'Product',offers}});
 expect(messages[0].variants).toEqual([{id:'offer:BLUE_36',title:'Beden: 36',url:offers[0].url,available:true},{id:'offer:BLUE_38',title:'Beden: 38',url:offers[1].url,available:false}]);
 expect(readVariants(messages[0].variants)).not.toBeNull();
 expect(new URL(variantUrl('https://shop.example/products/dress','offer:BLUE_38')).searchParams.get('_butika_variant')).toBe('offer:BLUE_38');
 expect(new URL(variantUrl('https://shop.example/products/dress?Beden=36','offer:BLUE_38',offers[1].url)).searchParams.get('Beden')).toBe('38');
 expect(()=>variantUrl('https://shop.example/products/dress','offer:BLUE_38','https://other.example/product')).toThrow();
 const headless=await capture({shopify:true,schema:{'@type':'Product',offers}});
 expect(headless.messages[0].variants).toEqual(messages[0].variants);
 const invalid=await capture({path:'/dress',shopify:false,schema:{'@type':'Product',offers:[offers[0],offers[0]]}});
 expect(invalid.messages[0].variants).toBeUndefined();
});

test('Aymarka picker preserves exact barcode identity and does not assume cached stock', async () => {
 const next={props:{pageProps:{data:{response:{product:{id:10,routePath:'dress',barcodes:[{id:20,stockTypeValues:[{name:'36'}]},{id:21,stockTypeValues:[{name:'38'}]}]}}}}}};
 const result=await capture({hostname:'www.machka.com.tr',path:'/urun/dress',shopify:false,next});
 expect(result.messages[0].variantStatus).toBe('ready');
 expect(result.messages[0].variants).toEqual([{id:'aymarka:10:20',title:'36',available:null},{id:'aymarka:10:21',title:'38',available:null}]);
 expect(readVariants(result.messages[0].variants)).not.toBeNull();
 expect(new URL(variantUrl('https://www.machka.com.tr/urun/dress','aymarka:10:20')).searchParams.get('_butika_variant')).toBe('aymarka:10:20');
 expect((await capture({hostname:'www.machka.com.tr',path:'/urun/other',shopify:false,next})).messages[0].variantStatus).toBe('error');
});

test('Brandroom exposes explicit size IDs and blocks unsupported price options',async()=>{
 const brandroom={ProductAttributes:[{ProductId:'a'.repeat(24),Id:'b'.repeat(24),HasCondition:false,IsRequired:true,AttributeControlType:2,Values:[{Id:'c'.repeat(24),Name:'XS-S',PriceAdjustmentValue:0},{Id:'d'.repeat(24),Name:'M-L',PriceAdjustmentValue:0}]}]};
 const result=await capture({hostname:'www.brandroom.com.tr',path:'/dress',brandroom,shopify:false});
 expect(result.messages[0].variantStatus).toBe('ready');expect(readVariants(result.messages[0].variants)).toHaveLength(2);
 expect(result.messages[0].variants[1].title).toBe('M-L');
 expect(new URL(variantUrl('https://www.brandroom.com.tr/dress',result.messages[0].variants[0].id)).searchParams.get('_butika_variant')).toBe(result.messages[0].variants[0].id);
 brandroom.ProductAttributes[0].Values[0].PriceAdjustmentValue=20;
 expect((await capture({hostname:'www.brandroom.com.tr',path:'/dress',brandroom,shopify:false})).messages[0].variantStatus).toBe('error');
});

test('Modanisa native choices preserve Turkish SKU and cannot save an implicit different size',async()=>{
 const responseProduct={id:'100',price:{symbol:'TL'},colors:[{productId:'100',sef:'https://www.modanisa.com/dress.html',sizes:[{sku:'200',name:'38',quantity:2},{sku:'201',name:'40',quantity:0}]}]};
 const r=await capture({hostname:'www.modanisa.com',path:'/dress.html',responseProduct,shopify:false});
 expect(r.messages[0].variants).toEqual([{id:'modanisa:100:200',title:'38',available:true},{id:'modanisa:100:201',title:'40',available:false}]);
 expect(readVariants(r.messages[0].variants)).toHaveLength(2);
 expect(new URL(variantUrl('https://www.modanisa.com/dress.html',r.messages[0].variants[1].id)).searchParams.get('_butika_variant')).toBe('modanisa:100:201');
});
test('Woo native picker obtains the parent list and saves a specific variation',async()=>{
 const responseProduct=[{id:10,type:'variable',permalink:'https://shop.example/dress',variations:[{id:20,attributes:[{name:'Beden',value:'38'}]},{id:21,attributes:[{name:'Beden',value:'40'}]}]}];
 const r=await capture({path:'/dress',woo:true,responseProduct,shopify:false});expect(r.messages[0].variantStatus).toBe('ready');
 expect(r.messages[0].variants[0]).toEqual({id:'woo:10:20',title:'Beden: 38',available:null});expect(readVariants(r.messages[0].variants)).toHaveLength(2);
});
test('a single option such as Shopify "Default Title" saves its identity without a picker or a title suffix',async()=>{
 const only=[{id:'46715470643456',title:'Default Title',available:true}];
 const {messages}=await capture({responseProduct:{id:1,handle:'dress',variants:only}});
 const read=readVariants(messages[0].variants);expect(read).toEqual(only);
 expect(singleVariantSave('https://shop.example/products/dress','Dress',read)).toEqual({url:'https://shop.example/products/dress?variant=46715470643456',title:'Dress'});
 expect(singleVariantSave('https://shop.example/products/dress','Dress',readVariants(variants))).toBeNull();
});
