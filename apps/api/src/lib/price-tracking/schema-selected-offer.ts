import { readStockMicrodata } from './microdata-stock';
import { jsonLdBlocks, parseJsonLd } from './json-ld-blocks';
import { trackingCurrency } from './currency';
import type { Availability } from './availability';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const sku=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_.-]{1,120}$/.test(v);
export function readSchemaSelection(rawUrl:string){
 const url=new URL(rawUrl),values=url.searchParams.getAll('_butika_variant');
 if(!values[0]?.startsWith('offer:'))return null;
 const id=values[0].slice(6);url.searchParams.delete('_butika_variant');
 return {sourceUrl:url.toString(),productId:'',variantId:values.length===1&&sku(id)?id:''};
}
export function extractSchemaSelectedOffer(html:string,url:string,selectedSku:string):{priceMinor:number;currency:string;availability:Availability}|null{
 if(!sku(selectedSku))return null;
 const expected=new URL(url),same=(raw:unknown)=>{if(typeof raw!=='string')return false;try{const actual=new URL(raw,expected);return actual.origin===expected.origin&&actual.pathname.replace(/\/$/,'')===expected.pathname.replace(/\/$/,'');}catch{return false;}};
 const canonical=readStockMicrodata(html).canonicals;
 if(canonical.length!==1||!same(canonical[0]))return null;
 const products:Record<string,unknown>[]=[];
 const walk=(v:unknown)=>{if(Array.isArray(v)){v.forEach(walk);return;}if(!object(v))return;if(v['@type']==='Product')products.push(v);if(v['@graph'])walk(v['@graph']);};
 for(const block of jsonLdBlocks(html))walk(parseJsonLd(block));
 if(products.length!==1)return null;
 const product=products[0]!;if(product.url!==undefined&&!same(product.url))return null;
 const offers=product.offers;
 if(!Array.isArray(offers)||!offers.length||offers.length>250||offers.some(o=>!object(o)||o['@type']!=='Offer'||!sku(o.sku)||!same(o.url))||new Set(offers.map(o=>o.sku)).size!==offers.length)return null;
 const selected=offers.find(o=>o.sku===selectedSku);if(!selected)return null;
 // An offer that states no price of its own (hivaatelier.com: the amount sits only in
 // priceSpecification) is priced by the page's ProductGroup, and only where that group
 // states the same amount for the same sku and variant address.
 const stated='price' in selected||'priceCurrency' in selected?selected:groupedOffer(html,expected,selected);
 if(!stated)return null;
 const currency=trackingCurrency(stated.priceCurrency),raw=String(stated.price);
 if(!currency||!/^\d+(?:\.\d{1,2})?$/.test(raw))return null;
 const priceMinor=Math.round(Number(raw)*100);if(!Number.isSafeInteger(priceMinor)||priceMinor<=0)return null;
 const state=(o:Record<string,unknown>)=>typeof o.availability==='string'?o.availability.replace(/^https?:\/\/schema\.org\//i,''):'';
 const status=state(selected);
 // Two statements about one variant that disagree on stock prove neither.
 if(state(stated)!==status)return {priceMinor,currency,availability:'unknown'};
 return {priceMinor,currency,availability:status==='InStock'?'in_stock':['OutOfStock','SoldOut','Discontinued'].includes(status)?'out_of_stock':'unknown'};
}
// The ProductGroup's own offer for the chosen sku: exactly one ProductGroup on the page,
// exactly one of its variants with that sku, a single Offer at the same variant address,
// and the same amount and currency as the chosen offer's UnitPriceSpecification.
function groupedOffer(html:string,base:URL,selected:Record<string,unknown>):Record<string,unknown>|null{
 const spec=selected.priceSpecification;
 if(!object(spec)||spec['@type']!=='UnitPriceSpecification'||'priceType' in spec)return null;
 const groups:Record<string,unknown>[]=[];
 const walk=(v:unknown)=>{if(Array.isArray(v)){v.forEach(walk);return;}if(!object(v))return;if(v['@type']==='ProductGroup')groups.push(v);if(v['@graph'])walk(v['@graph']);};
 for(const block of jsonLdBlocks(html))walk(parseJsonLd(block));
 const variants=groups.length===1&&Array.isArray(groups[0]!.hasVariant)?groups[0]!.hasVariant.filter(v=>object(v)&&v.sku===selected.sku):[];
 const offer=variants.length===1?(variants[0] as Record<string,unknown>).offers:null;
 if(!object(offer)||offer['@type']!=='Offer')return null;
 const href=(raw:unknown)=>{if(typeof raw!=='string')return null;try{return new URL(raw,base).href;}catch{return null;}};
 if(!href(offer.url)||href(offer.url)!==href(selected.url))return null;
 const amount=Number(offer.price);
 return Number.isFinite(amount)&&amount===Number(spec.price)&&typeof offer.priceCurrency==='string'&&offer.priceCurrency===spec.priceCurrency?offer:null;
}
