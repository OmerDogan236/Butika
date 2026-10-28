import {expect,test} from 'bun:test';
import {extractProductPrice} from './extract-product-price';

test('empty Angular shell can request the public rendered product using an honest crawler identity',async()=>{
 const original=globalThis.fetch;const calls:{url:string;ua:string|null}[]=[];
 try{
  
  globalThis.fetch=(async(input:string|URL,init?:RequestInit)=>{calls.push({url:String(input),ua:new Headers(init?.headers).get('user-agent')});
   return new Response(calls.length===1?'<body><spa-root></spa-root></body>':`<script type="application/ld+json">{"@type":"Product","url":"https://rendered.test/dress","offers":{"@type":"Offer","price":100,"priceCurrency":"TRY","availability":"https://schema.org/InStock"}}</script>`);
  }) as unknown as typeof fetch;
  expect(await extractProductPrice('https://rendered.test/dress')).toMatchObject({status:'success',priceMinor:10000,currency:'TRY',availability:'in_stock'});
  expect(calls).toHaveLength(2);expect(calls[1]).toEqual({url:'https://rendered.test/dress',ua:'ButikaPriceTracker/1.0'});
 }finally{globalThis.fetch=original;}
});
test('an ordinary page without a product does not trigger a rendering retry',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=(async()=>{calls++;return new Response('<body><spa-root>Category</spa-root></body>');}) as unknown as typeof fetch;
  expect((await extractProductPrice('https://category.test/category')).status).toBe('not_found');expect(calls).toBe(1);
 }finally{globalThis.fetch=original;}
});
