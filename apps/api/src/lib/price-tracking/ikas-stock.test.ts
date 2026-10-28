import { expect, test } from 'bun:test';
import { ikasProductAvailability, ikasVariantObservation } from './ikas-stock';
const productId='00000000-0000-0000-0000-000000000001', first='00000000-0000-0000-0000-000000000002', second='00000000-0000-0000-0000-000000000003';
const location='00000000-0000-0000-0000-000000000004', offline='00000000-0000-0000-0000-000000000005', channel='00000000-0000-0000-0000-000000000006';
const url='https://store.test/dress';
const variant=(id:string,count:number)=>({id,productId,deleted:false,isActive:true,stocks:[{stockLocationId:location,stockCount:count}],prices:[{currencyCode:'TRY',sellPrice:899,discountPrice:599,priceListId:null,campaignPrice:null}]});
const model={id:productId,deleted:false,metaData:{slug:'dress'},salesChannels:[{id:channel,status:'VISIBLE',minQuantityPerCart:null}],variants:[variant(first,2),variant(second,0)]};
const page=(product:unknown=model,offeredPrice=599)=>`<script id="__NEXT_DATA__">${JSON.stringify({props:{pageProps:{pageSpecificData:product,configJson:{salesChannelId:channel,stockLocationIds:[location]}}}})}</script><script type="application/ld+json">${JSON.stringify({'@type':'Product',offers:[first,second].map(id=>({'@type':'Offer',url:`${url}?vid=${id}`,price:offeredPrice,priceCurrency:'TRY'}))})}</script>`;

test('migrated IKAS product aliases require an exact same-origin canonical',()=>{
  const alias='https://store.test/products/dress';
  const canonical=`<link rel="canonical" href="${url}">`;
  expect(ikasVariantObservation(canonical+page(),alias,productId,first)?.availability).toBe('in_stock');
  expect(ikasVariantObservation(canonical+page(),alias,productId,second)?.availability).toBe('out_of_stock');
  expect(ikasProductAvailability(canonical+page(),alias,59900,'TRY')).toBe('unknown');
  const allStock={...model,variants:[variant(first,2),variant(second,3)]};
  expect(ikasProductAvailability(canonical+page(allStock),alias,59900,'TRY')).toBe('in_stock');
  for(const prefix of ['',canonical+canonical,canonical.replace('store.test','other.test'),canonical.replace('/dress','/another'),canonical.replace('/dress',`/dress?vid=${first}`)]) {
    expect(ikasVariantObservation(prefix+page(),alias,productId,first)).toBeNull();
  }
  expect(ikasVariantObservation(canonical+page(),'https://store.test/collections/dress',productId,first)).toBeNull();
});
test('IKAS uses the exact variant and validates discounted price against its rendered offer',()=>{
  expect(ikasVariantObservation(page(),url,productId,first)).toEqual({priceMinor:59900,currency:'TRY',availability:'in_stock'});
  expect(ikasVariantObservation(page(),url,productId,second)?.availability).toBe('out_of_stock');
  expect(ikasProductAvailability(page(),url,59900,'TRY')).toBe('unknown');
  expect(ikasVariantObservation(page(model,899),url,productId,first)).toBeNull();
});

test('a renamed slug retains the saved product and variant identity with one same-origin canonical',()=>{
  const old='https://store.test/products/old-dress';
  const canonical=`<link rel="canonical" href="${url}">`;
  expect(ikasVariantObservation(canonical+page(),old,productId,first)?.availability).toBe('in_stock');
  expect(ikasVariantObservation(canonical+page(),old,productId,second)?.availability).toBe('out_of_stock');
  expect(ikasVariantObservation(canonical+page(),old,offline,first)).toBeNull();
  expect(ikasVariantObservation(canonical+page(),old,productId,offline)).toBeNull();
  expect(ikasVariantObservation(canonical+page(model,899),old,productId,first)).toBeNull();
  const allStock={...model,variants:[variant(first,2),variant(second,3)]};
  expect(ikasProductAvailability(canonical+page(allStock),old,59900,'TRY')).toBe('unknown');
  for(const prefix of ['',canonical+canonical,canonical.replace('store.test','other.test'),canonical.replace('/dress','/another'),canonical.replace('/dress',`/dress?vid=${first}`),canonical.replace('/dress','/dress#x'),canonical.replace('https://','http://')]) {
    expect(ikasVariantObservation(prefix+page(),old,productId,first)).toBeNull();
  }
});
test('physical stock outside the online sales channel is not counted',()=>{
  const m={...model,variants:[{...variant(first,0),stocks:[{stockLocationId:location,stockCount:0},{stockLocationId:offline,stockCount:100}]},variant(second,0)]};
  expect(ikasVariantObservation(page(m),url,productId,first)?.availability).toBe('out_of_stock');
});
test('modern IKAS storefront JSON uses the same exact variant and online stock validation',()=>{
  const legacy=page();
  const modern=legacy.replace(/<script id="__NEXT_DATA__">[\s\S]*?<\/script>/,`<script id="__IKAS_DATA__">window.__IKAS_DATA__ = ${JSON.stringify({pageType:'PRODUCT',pageSpecificData:model,storefrontConfig:{salesChannelId:channel,stockLocationIds:[location]}})};</script>`);
  expect(ikasVariantObservation(modern,url,productId,first)?.availability).toBe('in_stock');
  expect(ikasVariantObservation(modern,url,productId,second)?.availability).toBe('out_of_stock');
  expect(ikasVariantObservation(modern.replace(";</script>",";doSomething();</script>"),url,productId,first)).toBeNull();
  expect(ikasVariantObservation(modern+legacy,url,productId,first)).toBeNull();
});
test('hidden products, another slug, duplicate identity and custom options cannot produce observations',()=>{
  expect(ikasVariantObservation(page({...model,salesChannels:[{id:channel,status:'HIDDEN'}]}),url,productId,first)).toBeNull();
  expect(ikasVariantObservation(page(),url+'/other',productId,first)).toBeNull();
  expect(ikasVariantObservation(page({...model,variants:[variant(first,2),variant(first,1)]}),url,productId,first)).toBeNull();
  expect(ikasVariantObservation(page({...model,productOptionSetId:'required-personalization'}),url,productId,first)).toBeNull();
});
test('one variant may use its sole offer without vid, and TR locale URLs keep exact identity',()=>{
  const single={...model,variants:[variant(first,2)]};
  const sole=page(single).replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,`<script type="application/ld+json">${JSON.stringify({'@type':'Product',offers:{url,price:599,priceCurrency:'TRY'}})}</script>`);
  expect(ikasVariantObservation(sole,url,productId,first)?.availability).toBe('in_stock');
  expect(ikasVariantObservation(sole.replace(url,`${url}/other`),url,productId,first)).toBeNull();
  expect(ikasVariantObservation(page().replaceAll(`${url}?vid=`,`https://store.test/tr/dress?vid=`),url,productId,first)?.availability).toBe('in_stock');
});
test('missing inventory can confirm sold out only with exact sold-out offer and no backorders',()=>{
  const missing={...model,variants:[{...variant(first,0),stocks:[],sellIfOutOfStock:false},variant(second,0)]};
  expect(ikasVariantObservation(page(missing),url,productId,first)?.availability).toBe('unknown');
  const explicit=page(missing).replaceAll('"priceCurrency":"TRY"','"priceCurrency":"TRY","availability":"https://schema.org/OutOfStock"');
  expect(ikasVariantObservation(explicit,url,productId,first)?.availability).toBe('out_of_stock');
});
test('a named-option offer cannot prove another variant with a different price',()=>{
  const chosen={id:location,variantTypeId:channel},other={id:offline,variantTypeId:channel};
  const selected={...model,selectedVariantValues:[chosen],variants:[{...variant(first,2),variantValues:[chosen]},{...variant(second,0),variantValues:[other],prices:[{...variant(second,0).prices[0],discountPrice:699}]}]};
  const html=page(selected).replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,`<script type="application/ld+json">${JSON.stringify({'@type':'Product',offers:{url:`${url}?Size=S`,price:599,priceCurrency:'TRY'}})}</script>`);
  expect(ikasVariantObservation(html,url,productId,first)?.availability).toBe('in_stock');
  expect(ikasVariantObservation(html,url,productId,second)).toBeNull();
});

test('free optional text notes preserve base variant tracking but paid or required options do not',()=>{
  const option={id:offline,productOptionSetId:location,deleted:false,isOptional:true,type:'TEXT',price:null,priceType:null,otherPrices:null,selectSettings:null,requiredOptionId:null,requiredOptionValueIds:null};
  const withOptions=(options:unknown[])=>({...model,productOptionSetId:location,productOptionSet:{id:location,deleted:false,options}});
  expect(ikasVariantObservation(page(withOptions([option])),url,productId,first)?.availability).toBe('in_stock');
  for(const change of [{isOptional:false},{price:55},{type:'CHOICE'},{otherPrices:[]},{requiredOptionId:channel},{productOptionSetId:channel},{deleted:true}]){
    expect(ikasVariantObservation(page(withOptions([{...option,...change}])),url,productId,first)).toBeNull();
  }
  expect(ikasVariantObservation(page(withOptions([option,option])),url,productId,first)).toBeNull();
  expect(ikasVariantObservation(page(withOptions([])),url,productId,first)).toBeNull();
});
