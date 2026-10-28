import { afterEach,expect,test } from 'bun:test';
import { extractProductPrice } from './extract-product-price';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
test.each([['579.5',57950],['100.0',10000],['579,5',57950],['1.299,50',129950],['1,299.50',129950],['1.000',100000]] as const)('decimal price %s is not multiplied by ten',async(raw,expected)=>{
  globalThis.fetch=(async()=>new Response(`<script type="application/ld+json">${JSON.stringify({'@type':'Product',offers:{'@type':'Offer',price:raw,priceCurrency:'TRY',availability:'InStock'}})}</script>`)) as unknown as typeof fetch;
  expect(await extractProductPrice('https://store.test/dress')).toMatchObject({status:'success',priceMinor:expected});
});
