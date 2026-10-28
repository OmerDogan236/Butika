import {expect,test} from 'bun:test';
import {extractProductHtml} from './extract-product-price';
const url='https://store.test/product';
const page=(currency:string)=>`<script type="application/ld+json">${JSON.stringify({'@type':'Product',url,offers:{'@type':'Offer',price:3499.99,priceCurrency:currency,availability:'https://schema.org/InStock'}})}</script>`;
test('the TL alias normalizes to TRY in both price and stock evidence',()=>{
 expect(extractProductHtml(page(' TL '),url)).toMatchObject({status:'success',currency:'TRY',priceMinor:349999,availability:'in_stock'});
});
test('unsupported currency precision and missing currency cannot enter tracking',()=>{
 for(const currency of ['JPY','KWD','','₺','$','TURKISH LIRA'])expect(extractProductHtml(page(currency),url).status).toBe('not_found');
 expect(extractProductHtml(page('USD'),url)).toMatchObject({status:'success',currency:'USD',priceMinor:349999});
});
