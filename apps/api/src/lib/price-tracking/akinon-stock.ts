import type {Availability} from './availability';
import {retailerFetch} from './retailer-http';
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function readAkinonProduct(html:string):Record<string,unknown>|null{
  const hits=[...html.matchAll(/\bvar\s+rawProduct\s*=\s*'([^']*)'\s*;/g)];
  if(hits.length!==1)return null;
  try{const data=JSON.parse(hits[0]![1]!.replace(/\\u([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))));return obj(data)&&Number.isSafeInteger(data.pk)&&Number(data.pk)>0?data:null;}catch{return null;}
}
function samePage(path:unknown,url:string){if(typeof path!=='string')return false;try{const target=new URL(path,url),expected=new URL(url);return target.origin===expected.origin&&target.pathname.replace(/\/$/,'')===expected.pathname.replace(/\/$/,'');}catch{return false;}}
// Product API contract: https://apidocs.akinon.com/commerce-openapis/products/product
export function akinonStockProof(data:unknown,identity:Record<string,unknown>,url:string,priceMinor:number,currency:string):Availability{
  if(!obj(data)||!obj(data.product)||!Array.isArray(data.variants)||data.variants.length||!Array.isArray(data.offers)||data.offers.length)return 'unknown';
  const product=data.product;
  if(product.pk!==identity.pk||product.sku!==identity.sku||!samePage(identity.absolute_url,url)||!samePage(product.absolute_url,url)||String(product.product_type)!=='0'||product.is_listable!==true||product.form_schema||product.data_source)return 'unknown';
  if(!Array.isArray(product.basket_offers)||product.basket_offers.length||!Array.isArray(product.data_source_offers)||product.data_source_offers.length)return 'unknown';
  if(product.price_type!=='default'||String(product.currency_type).toUpperCase()!==currency||String(identity.currency_type).toUpperCase()!==currency)return 'unknown';
  for(const price of [product.price,identity.price])if(typeof price!=='string'||!/^\d+(?:\.\d{1,2})?$/.test(price)||Math.round(Number(price)*100)!==priceMinor)return 'unknown';
  if(typeof product.stock!=='number'||!Number.isFinite(product.stock)||product.stock<0)return 'unknown';
  return product.stock>0&&product.in_stock===true&&product.is_ready_to_basket===true?'in_stock':product.stock===0&&product.in_stock===false?'out_of_stock':'unknown';
}
export async function akinonAvailability(html:string,url:string,priceMinor:number,currency:string):Promise<Availability>{
  const identity=readAkinonProduct(html);if(!identity||!samePage(identity.absolute_url,url))return 'unknown';
  try{const response=await retailerFetch(new URL(`/product/${identity.pk}/`,url),{signal:AbortSignal.timeout(12000),headers:{accept:'application/json'}});if(!response.ok){await response.body?.cancel();return 'unknown';}return akinonStockProof(await response.json(),identity,url,priceMinor,currency);}catch{return 'unknown';}
}
