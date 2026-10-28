import {readStockMicrodata} from './microdata-stock';
import {trackingCurrency} from './currency';
export function scopedMicrodataPrice(html:string,url:string) {
  const m=readStockMicrodata(html);
  if(!m.complete||m.products.length!==1||m.canonicals.length!==1)return null;
  try{
    const expected=new URL(url),canonical=new URL(m.canonicals[0]!,url);
    if(canonical.origin!==expected.origin||decodeURIComponent(canonical.pathname).replace(/\/$/,'')!==decodeURIComponent(expected.pathname).replace(/\/$/,''))return null;
    const offers=m.offers.filter(o=>o.parent===m.products[0]);
    if(offers.length!==1)return null;
    const p=offers[0]!.props;
    if(p.price?.length!==1||p.priceCurrency?.length!==1||!/^\d+(?:\.\d{1,2})?$/.test(p.price[0]!))return null;
    const currency=trackingCurrency(p.priceCurrency[0]!),priceMinor=Math.round(Number(p.price[0])*100);
    return currency&&Number.isSafeInteger(priceMinor)&&priceMinor>0?{priceMinor,currency}:null;
  }catch{return null;}
}
