import {retailerFetch} from './retailer-http';
import type {Availability} from './availability';
export function modanisaSlug(raw:string) {
 const u=new URL(raw);
 return u.protocol==='https:'&&/^(www\.)?modanisa\.com$/.test(u.hostname)&&/^\/[a-z0-9-]+\.html$/.test(u.pathname)?u.pathname.slice(1,-5):null;
}
export function readModanisaSelection(raw:string) {
 const u=new URL(raw),values=u.searchParams.getAll('_butika_variant');
 if(!values.some(v=>v.startsWith('modanisa:')))return null;
 const match=values.length===1&&modanisaSlug(raw)?/^modanisa:([1-9]\d*):([1-9]\d*)$/.exec(values[0]!):null;
 u.searchParams.delete('_butika_variant');return {sourceUrl:u.toString(),productId:match?.[1]??'',variantId:match?.[2]??''};
}
export function parseModanisaProduct(data:any,raw:string) {
 try{
  const slug=modanisaSlug(raw),selection=readModanisaSelection(raw);
  if(!slug||!/^\d+$/.test(data.id)||data.price?.symbol!=='TL'||!Array.isArray(data.colors)||
    !/^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2} TL$/.test(data.price.sellPrice))return null;
  const matches=data.colors.filter((c:any)=>c.productId===data.id&&modanisaSlug(c.sef)===slug);
  if(matches.length!==1||!Array.isArray(matches[0].sizes)||!matches[0].sizes.length||matches[0].sizes.length>250)return null;
  const sizes=matches[0].sizes;
  if(sizes.some((s:any)=>typeof s.sku!=='string'||!/^\d+$/.test(s.sku)||typeof s.name!=='string'||!s.name.trim()||!Number.isSafeInteger(s.quantity)||s.quantity<0)||new Set(sizes.map((s:any)=>s.sku)).size!==sizes.length)return null;
  if(selection&&(!selection.variantId||selection.productId!==data.id||!sizes.some((s:any)=>s.sku===selection.variantId)))return null;
  const selected=selection?sizes.filter((s:any)=>s.sku===selection.variantId):sizes;
  const availability:Availability=selected.every((s:any)=>s.quantity>0)?'in_stock':selected.every((s:any)=>s.quantity===0)?'out_of_stock':'unknown';
  const priceMinor=Math.round(Number(data.price.sellPrice.replace(' TL','').replaceAll('.','').replace(',','.'))*100);
  if(!Number.isSafeInteger(priceMinor)||priceMinor<=0)return null;
  return {priceMinor,currency:'TRY',availability,productId:data.id as string,sizes:sizes as {sku:string;name:string;quantity:number}[]};
 }catch{return null;}
}
export async function modanisaObservation(raw:string,signal:AbortSignal) {
 const slug=modanisaSlug(raw);if(!slug)return null;
 const internal=new URL(raw).searchParams.has('_butika_variant');
 if(internal&&!readModanisaSelection(raw)?.variantId)return null;
 try{
  const response=await retailerFetch('https://product-detail-pd-bff.modanisa.com/product/slug/'+encodeURIComponent(slug),{signal,redirect:'error',headers:{accept:'application/json','accept-language':'tr','x-shipping-country-code':'TR','x-shipping-country-code-alpha3':'TUR','x-display-currency':'TRY'}});
  if(!response.ok){await response.body?.cancel();return null;}
  return parseModanisaProduct(await response.json(),raw);
 }catch{return null;}
}
