import {afterEach,expect,test} from 'bun:test';
import {extractProductPrice} from './extract-product-price';
import {woocommerceStorePriceProvider} from './providers/woocommerce-store-provider';
const originalFetch=globalThis.fetch,originalGet=woocommerceStorePriceProvider.getPrice;
afterEach(()=>{globalThis.fetch=originalFetch;woocommerceStorePriceProvider.getPrice=originalGet;});
test('Woo storefront stock enriches an HTML price only when exact prices agree',async()=>{
 globalThis.fetch=(async()=>new Response(`<body class="single-product woocommerce"><script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer","price":100,"priceCurrency":"TRY"}}</script></body>`)) as unknown as typeof fetch;
 let priceMinor=10000;
 woocommerceStorePriceProvider.getPrice=async()=>({status:'success',observation:{priceMinor,currency:'TRY',availability:'in_stock',observedAt:new Date(),provider:'woocommerce'}});
 expect(await extractProductPrice('https://store.test/urun/dress')).toMatchObject({status:'success',priceMinor:10000,availability:'in_stock'});
 priceMinor=9000;
 expect(await extractProductPrice('https://store.test/urun/dress')).toMatchObject({status:'success',priceMinor:10000,availability:'unknown'});
});

test('generic Woo stock cannot fill in missing availability for an explicit SKU',async()=>{
 const url='https://store.test/urun/dress';let calls=0;
 globalThis.fetch=(async()=>new Response(`<body class="woocommerce"><link rel="canonical" href="${url}"><script type="application/ld+json">{"@type":"Product","offers":[{"@type":"Offer","sku":"SIZE_M","url":"${url}?Beden=M","price":100,"priceCurrency":"TRY"}]}</script></body>`)) as unknown as typeof fetch;
 woocommerceStorePriceProvider.getPrice=async()=>{calls++;return {status:'success',observation:{priceMinor:10000,currency:'TRY',availability:'in_stock',observedAt:new Date(),provider:'woocommerce'}};};
 expect(await extractProductPrice(`${url}?_butika_variant=offer:SIZE_M`)).toMatchObject({status:'success',availability:'unknown'});
 expect(calls).toBe(0);
});
