import {expect,test} from 'bun:test';
import {extractProductHtml} from './extract-product-price';
import {readSchemaSelection} from './schema-selected-offer';
import {HIVA_MARE_MINI_HTML,HIVA_MARE_MINI_URL} from './hivaatelier.fixture';
const url='https://shop.test/products/dress';
const offers=[{sku:'BLUE_36',price:'479.90',availability:'https://schema.org/InStock'},{sku:'BLUE_38',price:'499.90',availability:'https://schema.org/OutOfStock'}].map((o,i)=>({'@type':'Offer',priceCurrency:'TRY',url:`${url}?Beden=${36+i*2}`,...o}));
const page=(value:unknown=offers,canonical=url)=>`<link rel="canonical" href="${canonical}"><script type="application/ld+json">${JSON.stringify({'@type':'Product',offers:value})}</script>`;
test('a SKU-specific offer keeps its own size price and stock',()=>{
 expect(extractProductHtml(page(),`${url}?_butika_variant=offer:BLUE_36`)).toMatchObject({status:'success',priceMinor:47990,availability:'in_stock'});
 expect(extractProductHtml(page(),`${url}?_butika_variant=offer:BLUE_38`)).toMatchObject({status:'success',priceMinor:49990,availability:'out_of_stock'});
 expect(readSchemaSelection(`${url}?_butika_variant=offer:BLUE_36`)?.sourceUrl).toBe(url);
});
test('missing or ambiguous SKU evidence cannot fall back to another size',()=>{
 for(const html of [page([offers[0],offers[0]]),page(offers,url+'/other'),page([offers[0],{...offers[1],url:'https://other.test/product'}]),page(offers)+page(offers)])
  expect(extractProductHtml(html,`${url}?_butika_variant=offer:BLUE_36`).status).toBe('not_found');
 expect(extractProductHtml(page(),`${url}?_butika_variant=offer:MISSING`).status).toBe('not_found');
 expect(extractProductHtml(page(),`${url}?_butika_variant=offer:BLUE_36&_butika_variant=offer:BLUE_38`).status).toBe('not_found');
});

// hivaatelier.com: the app offers these colours from the Product block's offers (sku +
// url), but that block states each price only inside priceSpecification. The page's
// ProductGroup block states the same variant's price directly.
const hiva=(sku:string,html=HIVA_MARE_MINI_HTML)=>extractProductHtml(html,`${HIVA_MARE_MINI_URL}&_butika_variant=offer:${sku}`);
const altered=(from:string|RegExp,to:string)=>{const html=HIVA_MARE_MINI_HTML.replace(from,to);expect(html).not.toBe(HIVA_MARE_MINI_HTML);return html;};
const unverified={status:'not_found',error:'Selected variant cannot be verified'} as const;
test('hivaatelier: a chosen colour priced only in priceSpecification is read when the ProductGroup agrees',()=>{
 expect(hiva('010380002CR')).toEqual({status:'success',priceMinor:1895000,currency:'TRY',availability:'in_stock',source:'json-ld'});
 expect(hiva('010380001CRY')).toMatchObject({status:'success',priceMinor:2645000,currency:'TRY'});
 expect(hiva('MISSING')).toEqual(unverified);
});
test('hivaatelier: without an agreeing ProductGroup the chosen colour stays unverified',()=>{
 // No ProductGroup on the page.
 expect(hiva('010380002CR',altered('"@type": "ProductGroup"','"@type": "Thing"'))).toEqual(unverified);
 // The ProductGroup states another amount for this colour (only its own offer ends in a comma).
 expect(hiva('010380001CRY',altered('"price": "26450.00",','"price": "25000.00",'))).toEqual(unverified);
 // The ProductGroup states another currency for it.
 expect(hiva('010380001CRY',altered(/("price": "26450\.00",\s+"priceCurrency": )"TRY"/,'$1"EUR"'))).toEqual(unverified);
 // Two ProductGroup variants claim the chosen sku.
 expect(hiva('010380002CR',altered(/"sku": "010380004FT"(?!,)/,'"sku": "010380002CR"'))).toEqual(unverified);
 // The ProductGroup's offer for this sku points at another variant address.
 expect(hiva('010380002CR',altered(/("priceCurrency": "TRY",\s+"url": "[^"]*\?variant=)43323553349841/,'$142500692148433'))).toEqual(unverified);
 // The ProductGroup and the Product disagree about this colour's stock: the price stays, the stock does not.
 expect(hiva('010380002CR',altered(/("@id": "\/products\/mare-mini-shoulder-bag\?variant=43323553349841#offer",\s+"@type": "Offer",\s+"availability": "http:\/\/schema\.org\/)InStock/,'$1OutOfStock')))
  .toEqual({status:'success',priceMinor:1895000,currency:'TRY',availability:'unknown',source:'json-ld'});
});
