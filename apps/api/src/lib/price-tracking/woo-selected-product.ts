import {retailerFetch} from './retailer-http';
import {wooAvailability} from './availability';
import {trackingCurrency} from './currency';
export function readWooSelection(raw:string) {
 const u=new URL(raw),values=u.searchParams.getAll('_butika_variant');
 if(!values.some(v=>v.startsWith('woo:')))return null;
 const m=values.length===1&&u.protocol==='https:'?/^woo:([1-9]\d*):([1-9]\d*)$/.exec(values[0]!):null;
 u.searchParams.delete('_butika_variant');return {sourceUrl:u.toString(),productId:m?.[1]??'',variantId:m?.[2]??''};
}
export function parseWooSelection(parent:any,variant:any,raw:string) {
 try{
  const s=readWooSelection(raw);if(!s?.variantId)return null;
  const u=new URL(raw),same=(v:string)=>{const x=new URL(v);return x.origin===u.origin&&decodeURIComponent(x.pathname).replace(/\/$/,'')===decodeURIComponent(u.pathname).replace(/\/$/,'');};
  if(String(parent.id)!==s.productId||parent.type!=='variable'||!same(parent.permalink)||!Array.isArray(parent.variations)||
    parent.variations.filter((v:any)=>String(v.id)===s.variantId).length!==1||
    String(variant.id)!==s.variantId||variant.parent!==parent.id||variant.type!=='variation'||!same(variant.permalink))return null;
  const prices=variant.prices,currency=trackingCurrency(prices?.currency_code);
  if(!currency||prices.currency_minor_unit!==2||typeof prices.price!=='string'||!/^\d+$/.test(prices.price)||prices.price_range!=null)return null;
  const priceMinor=Number(prices.price);if(!Number.isSafeInteger(priceMinor)||priceMinor<=0)return null;
  return {priceMinor,currency,availability:wooAvailability(variant)};
 }catch{return null;}
}
export async function wooSelectedObservation(raw:string,signal:AbortSignal) {
 const s=readWooSelection(raw);if(!s?.variantId)return null;
 const base=new URL(raw).origin+'/wp-json/wc/store/v1/products/';
 try{
  const get=async(id:string)=>{const r=await retailerFetch(base+id,{signal,redirect:'error',headers:{accept:'application/json'}});if(!r.ok){await r.body?.cancel();throw new Error('Product unavailable');}return r.json();};
  const parent=await get(s.productId),variant=await get(s.variantId);
  return parseWooSelection(parent,variant,raw);
 }catch{return null;}
}
