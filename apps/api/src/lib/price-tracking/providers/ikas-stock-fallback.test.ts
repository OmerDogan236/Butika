import { afterEach, expect, test } from 'bun:test';
import { ikasPublicPriceProvider } from './ikas-public-provider';
import { structuredHtmlPriceProvider } from './structured-html-provider';
import { resolveProductPrice } from '../price-source-router';
const originalFetch=globalThis.fetch;
const originalStructuredGetPrice=structuredHtmlPriceProvider.getPrice;
afterEach(()=>{globalThis.fetch=originalFetch;structuredHtmlPriceProvider.getPrice=originalStructuredGetPrice;});
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
function html(stocks:number[],complete=true,offerPrice=100){
  const product={id:id(1),deleted:false,metaData:{slug:'dress'},salesChannels:[{id:id(3),status:'VISIBLE'}],variants:stocks.map((n,i)=>({id:id(i+10),productId:id(1),deleted:false,isActive:true,
    stocks:[{stockLocationId:id(2),stockCount:n}],prices:[{sellPrice:100,discountPrice:null,campaignPrice:null,priceListId:null,currencyCode:'TRY'}]}))};
  return `<script src="https://cdn.myikas.com/test.js"></script><script id="__NEXT_DATA__">${JSON.stringify({page:'/[slug]',props:{pageProps:{pageSpecificData:product,...(complete?{configJson:{salesChannelId:id(3),stockLocationIds:[id(2)]}}:{})}}})}</script><script type="application/ld+json">${JSON.stringify({'@type':'Product',offers:product.variants.map(v=>({'@type':'Offer',url:`https://ikas-fallback.test/dress?vid=${v.id}`,price:offerPrice,priceCurrency:'TRY'}))})}</script>`;
}
test('IKAS fallback preserves fully verified uniform stock and marks incomplete evidence unknown',async()=>{
  for(const [counts,complete,price,expected] of [
    [[1,2],true,100,'in_stock'], [[0,0],true,100,'out_of_stock'],
    [[1,0],true,100,'unknown'],[[1,2],false,100,'unknown'],[[1,2],true,90,'unknown'],
  ] as const){
    globalThis.fetch=(async()=>new Response(html([...counts],complete,price))) as unknown as typeof fetch;
    expect(await ikasPublicPriceProvider.getPrice({url:'https://ikas-fallback.test/dress',expectedCurrency:'TRY'}))
      .toMatchObject({status:'success',observation:{priceMinor:10000,currency:'TRY',availability:expected}});
  }
});
test('fallback does not attach product-wide stock to an explicit variant selection',async()=>{
  globalThis.fetch=(async()=>new Response(html([1,2]))) as unknown as typeof fetch;
  for(const selection of ['variant=999',`vid=${id(10)}`,`_butika_variant=ikas:${id(1)}:${id(10)}`]){
    expect(await ikasPublicPriceProvider.getPrice({url:`https://ikas-fallback.test/dress?${selection}`,expectedCurrency:'TRY'}))
      .toMatchObject({status:'success',observation:{availability:'unknown'}});
  }
});
test('router preserves IKAS fallback stock after a structured HTML timeout',async()=>{
  // Controlled reproduction of the archived timeout; no live request or real wait.
  structuredHtmlPriceProvider.getPrice=async()=>({status:'failure',reason:'timeout',error:'Simulated structured timeout'});
  for(const [counts,expected] of [[[1,2],'in_stock'],[[0,0],'out_of_stock'],[[1,0],'unknown']] as const){
    globalThis.fetch=(async()=>new Response(html([...counts]))) as unknown as typeof fetch;
    const result=await resolveProductPrice({url:'https://ikas-fallback.test/dress',expectedCurrency:'TRY'});
    expect(result).toMatchObject({status:'success',observation:{provider:'ikas',method:'next-data-page-specific',priceMinor:10000,currency:'TRY',availability:expected}});
    expect(result.attempts).toMatchObject([{provider:'structured_html',status:'failure',reason:'timeout'},{provider:'ikas',status:'success'}]);
  }
});
