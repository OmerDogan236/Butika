import type { Availability } from './availability';
import { retailerFetch } from './retailer-http';
import { readStockMicrodata } from './microdata-stock';
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
function literal(html:string,key:string){const hits=[...html.matchAll(new RegExp(`\\bvar\\s+${key}\\s*=\\s*["']([^"']+)["']`,'g'))];return hits.length&&new Set(hits.map(hit=>hit[1])).size===1?hits[0]![1]:null;}
export function farktorContext(html:string,url:string){
  if(!html.includes('https://service.farktor.com/services/api/stock-control/')||!html.includes('https://farktorapi.com/new/'))return null;
  const company=literal(html,'FCODE'),store=literal(html,'SCODE'),id=literal(html,'PRODUCT_ID');
  if(!company||!/^Fr-[1-9]\d*$/.test(company)||!store||!new RegExp(`^${company}-[1-9]\\d*$`).test(store)||!id||! /^[1-9]\d*$/.test(id))return null;
  if(literal(html,'x_priceType')!=='1'||literal(html,'Domestic')!=='TR'||!['TL','TRY'].includes(literal(html,'DomesticCURRENCY')??''))return null;
  const canonicals=readStockMicrodata(html).canonicals;
  if(canonicals.length!==1)return null;
  try{const canonical=new URL(canonicals[0]!,url),expected=new URL(url);if(canonical.hostname!==expected.hostname||canonical.pathname.replace(/^\/tr\//,'/').replace(/\/$/,'')!==expected.pathname.replace(/^\/tr\//,'/').replace(/\/$/,''))return null;}catch{return null;}
  return {company,store,id};
}
export function farktorStockProof(data:unknown,stockText:string,context:{company:string;id:string},priceMinor:number,currency:string):Availability {
  if(currency!=='TRY'||!obj(data)||data.fcode!==context.company||String(data.productId)!==context.id||data.status!==1||data.nonSale!==0||data.stockResume!==0)return 'unknown';
  if(['priceRuleTimeType','priceRuleTimeStatus','priceRuleStockType','priceRuleStockStatus','daysOffer'].some(k=>data[k]!==0))return 'unknown';
  if(!Array.isArray(data.rules)||data.rules.length||!Array.isArray(data.campaigns)||data.campaigns.length||!Array.isArray(data.sizes)||!data.sizes.length)return 'unknown';
  if(!number(data.priceSale)||Math.round(data.priceSale*100)!==priceMinor)return 'unknown';
  const sizes=data.sizes;
  if(sizes.some(v=>!obj(v)||!Number.isSafeInteger(v.productId)||!number(v.qty)||!number(v.priceSale)||Math.round(v.priceSale*100)!==priceMinor||v.setWebSale!==0))return 'unknown';
  const ids=sizes.map(v=>String(v.productId));if(new Set(ids).size!==ids.length||!ids.includes(context.id))return 'unknown';
  const parts=stockText.split('##');
  if(parts.length!==8||parts.slice(4).some(v=>v.trim()))return 'unknown';
  const price=parts[3]?.split('||')[0];
  if(!price||!/^\d+,\d{2}$/.test(price)||Math.round(Number(price.replace(',','.'))*100)!==priceMinor)return 'unknown';
  const stocks=(parts[0]??'').split('@@').filter(Boolean).map(row=>/^([1-9]\d*)\|\|(\d+)\|\|0$/.exec(row));
  if(stocks.length!==sizes.length||stocks.some(row=>!row)||new Set(stocks.map(row=>row![1])).size!==stocks.length)return 'unknown';
  for(const size of sizes){const row=stocks.find(row=>row![1]===String(size.productId));if(!row||Number(row[2])!==size.qty)return 'unknown';}
  const sum=sizes.reduce((n,v)=>n+v.qty,0),selected=sizes.find(v=>String(v.productId)===context.id);
  if(sum!==data.stockAll||selected.qty!==data.stockWeb)return 'unknown';
  return sizes.every(v=>v.qty>0)?'in_stock':sizes.every(v=>v.qty===0)?'out_of_stock':'unknown';
}
export async function farktorAvailability(html:string,url:string,priceMinor:number,currency:string):Promise<Availability>{
  const context=farktorContext(html,url);if(!context||currency!=='TRY')return 'unknown';
  try{
    const signal=AbortSignal.timeout(12000);
    const response=await retailerFetch(`https://farktorapi.com/new/${context.company}/${context.id}?V6.1`,{signal});
    if(!response.ok){await response.body?.cancel();return 'unknown';}
    const data:unknown=await response.json();
    if(!obj(data)||typeof data.modelCode!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(data.modelCode))return 'unknown';
    const stock=await retailerFetch(`https://service.farktor.com/services/api/stock-control/${context.company}/${context.store}/${data.modelCode}/0`,{signal});
    if(!stock.ok){await stock.body?.cancel();return 'unknown';}
    return farktorStockProof(data,await stock.text(),context,priceMinor,currency);
  }catch{return 'unknown';}
}
