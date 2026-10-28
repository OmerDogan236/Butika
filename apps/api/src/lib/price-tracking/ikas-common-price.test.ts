import { expect, test } from 'bun:test';
import { ikasProductAvailability, ikasVariantObservation } from './ikas-stock';

const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const url='https://common-price.test/dress';
function fixture() {
  const value=(n:number)=>({id:id(n),variantTypeId:id(20)});
  const product={id:id(1),deleted:false,metaData:{slug:'dress'},selectedVariantValues:[value(30)],
    salesChannels:[{id:id(2),status:'VISIBLE'}],variants:[0,1].map(n=>({id:id(10+n),productId:id(1),deleted:false,isActive:true,sellIfOutOfStock:false,
      variantValues:[value(30+n)],stocks:[{stockLocationId:id(3),stockCount:n===0?0:4}],
      prices:[{sellPrice:100,discountPrice:80,campaignPrice:null,priceListId:null,currencyCode:'TRY'}]}))};
  return {product,config:{salesChannelId:id(2),stockLocationIds:[id(3)]},offer:{url:`${url}?Size=S`,price:80,priceCurrency:'TRY',availability:'https://schema.org/OutOfStock'}};
}
function html(f:ReturnType<typeof fixture>) {
  return `<script id="__NEXT_DATA__">${JSON.stringify({props:{pageProps:{pageSpecificData:f.product,configJson:f.config}}})}</script><script type="application/ld+json">${JSON.stringify({'@type':'Product',offers:f.offer})}</script>`;
}
const read=(f:ReturnType<typeof fixture>)=>ikasVariantObservation(html(f),url,id(1),id(11));

test('one proven default Offer corroborates equal prices but never transfers its stock',()=>{
  const f=fixture();
  expect(read(f)).toEqual({priceMinor:8000,currency:'TRY',availability:'in_stock'});
  expect(ikasProductAvailability(html(f),url,8000,'TRY')).toBe('unknown');
  f.product.variants[0]!.stocks[0]!.stockCount=4;
  f.product.variants[1]!.stocks[0]!.stockCount=0;
  f.offer.availability='https://schema.org/InStock';
  expect(read(f)?.availability).toBe('out_of_stock');
  f.product.variants[1]!.stocks[0]!.stockCount=1;
  expect(ikasProductAvailability(html(f),url,8000,'TRY')).toBe('in_stock');
});

test('uniform price proof also supports an exact default vid',()=>{
  const f=fixture();f.offer.url=`${url}?vid=${id(10)}`;
  expect(read(f)?.availability).toBe('in_stock');
});

test('missing online stock remains unknown even with a sold-out default Offer',()=>{
  const f=fixture(); f.product.variants[1]!.stocks=[];
  expect(read(f)?.availability).toBe('unknown');
  f.product.variants[1]!.stocks=[{stockLocationId:id(3),stockCount:4}];
  f.config.stockLocationIds.push(id(4));
  expect(read(f)?.availability).toBe('unknown');
});

test('nonuniform, incomplete, campaign and customer-list prices reject common proof',()=>{
  const changes:Array<(f:ReturnType<typeof fixture>)=>void>=[
    f=>{f.product.variants[0]!.prices[0]!.discountPrice=79;},
    f=>{f.product.variants[1]!.prices[0]!.currencyCode='USD';},
    f=>{f.product.variants[0]!.prices=[];},
    f=>{Object.assign(f.product.variants[0]!.prices[0]!,{campaignPrice:60});},
    f=>{Object.assign(f.product.variants[0]!.prices[0]!,{priceListId:id(50)});},
    f=>{f.product.variants[0]!.prices.push({...f.product.variants[0]!.prices[0]!});},
    f=>{f.product.variants[0]!.deleted=true;},
    f=>{f.offer.price=90;},
  ];
  for(const change of changes){const f=fixture();change(f);expect(read(f)).toBeNull();}
});

test('ambiguous, foreign or unowned Offers cannot be used as a price anchor',()=>{
  const changes:Array<(f:ReturnType<typeof fixture>)=>void>=[
    f=>{f.offer.url=`${url}?vid=${id(99)}`;},
    f=>{f.offer.url=`${url}?vid=${id(10)}&vid=${id(11)}`;},
    f=>{f.offer.url=`https://other.test/dress?vid=${id(10)}`;},
    f=>{f.offer.url=`http://common-price.test/dress?vid=${id(10)}`;},
    f=>{f.offer.url=`${url}-other?vid=${id(10)}`;},
    f=>{f.product.selectedVariantValues=[];},
    f=>{f.product.variants[1]!.variantValues=f.product.variants[0]!.variantValues;},
    f=>{f.product.variants[0]!.id=id(11);},
    f=>{Object.assign(f,{offer:[f.offer,f.offer]});},
  ];
  for(const change of changes){const f=fixture();change(f);expect(read(f)).toBeNull();}
});

test('paid options and invalid selected stock still reject observation',()=>{
  const f=fixture();Object.assign(f.product,{productOptionSetId:id(70)});
  expect(read(f)).toBeNull();
  const g=fixture();g.product.variants[1]!.stocks[0]!.stockCount=-1;
  expect(read(g)).toBeNull();
});
