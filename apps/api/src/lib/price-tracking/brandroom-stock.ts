import { retailerFetch } from './retailer-http';
import { readStockMicrodata } from './microdata-stock';
import type { Availability } from './availability';
const id = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{24}$/.test(v);
const supported = (u: URL) => u.protocol === 'https:' && /^(www\.)?brandroom\.com\.tr$/.test(u.hostname);

export function readBrandroomSelection(raw: string) {
  const u=new URL(raw), values=u.searchParams.getAll('_butika_variant');
  if (!values.some(v=>v.startsWith('brandroom:'))) return null;
  const match=values.length===1 && supported(u) ? /^brandroom:([0-9a-f]{24}):([0-9a-f]{24}):([0-9a-f]{24})$/.exec(values[0]!) : null;
  u.searchParams.delete('_butika_variant');
  return {sourceUrl:u.toString(),productId:match?.[1]??'',attributeId:match?.[2]??'',variantId:match?.[3]??''};
}

export function brandroomProduct(html: string, raw: string) {
  const u=new URL(raw); if(!supported(u))return null;
  try {
    const assignments=[...html.matchAll(/this\.ProductAttributes\s*=\s*(\[[\s\S]*?\]);/g)];
    if(assignments.length!==1)return null;
    const attributes=JSON.parse(assignments[0]![1]!);
    // Multiple attributes, customization and conditional options need their own
    // combination model; never silently pick a default for them.
    if(!Array.isArray(attributes)||attributes.length!==1)return null;
    const a=attributes[0];
    if(!id(a.ProductId)||!id(a.Id)||a.HasCondition!==false||a.IsRequired!==true||a.AttributeControlType!==2||
      !Array.isArray(a.Values)||!a.Values.length||a.Values.length>250||
      a.Values.some((v:any)=>!id(v.Id)||typeof v.Name!=='string'||!v.Name.trim()||v.PriceAdjustmentValue!==0)||
      new Set(a.Values.map((v:any)=>v.Id)).size!==a.Values.length)return null;
    const forms:string[]=[],products:string[]=[];
    new HTMLRewriter().on('form#product-details-form',{element(el){const action=el.getAttribute('action');if(action)forms.push(action);}})
      .on('form#product-details-form [itemscope][data-productid]',{element(el){products.push(el.getAttribute('data-productid')??'');}}).transform(html);
    const same=(value:string)=>{const x=new URL(value,u);return x.origin===u.origin&&decodeURIComponent(x.pathname).replace(/\/$/,'')===decodeURIComponent(u.pathname).replace(/\/$/,'');};
    const m=readStockMicrodata(html);
    if(forms.length!==1||!forms[0]||!same(forms[0])||products.length!==1||products[0]!==a.ProductId||
      m.canonicals.length!==1||!same(m.canonicals[0]!)||m.products.length!==1)return null;
    const offers=m.offers.filter(o=>o.parent===m.products[0]);
    if(offers.length!==1)return null;
    const p=offers[0]!.props;
    if(p.price?.length!==1||p.priceCurrency?.length!==1||p.priceCurrency[0]!=='TRY'||!/^\d+(?:\.\d{1,2})?$/.test(p.price[0]!))return null;
    const priceMinor=Math.round(Number(p.price[0])*100);
    if(!Number.isSafeInteger(priceMinor)||priceMinor<=0)return null;
    return {productId:a.ProductId as string,attributeId:a.Id as string,values:a.Values as {Id:string;Name:string}[],priceMinor,currency:'TRY'};
  }catch{return null;}
}

export function brandroomStock(product: NonNullable<ReturnType<typeof brandroomProduct>>, valueId: string, data: any): Availability {
  try {
    const c=data.selectedProductAttributeCombination;
    const money=(v:unknown)=>typeof v==='string'&&/^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2} TL$/.test(v) ? Math.round(Number(v.replace(/ TL$/,'').replaceAll('.','').replace(',','.'))*100) : null;
    if(!product.values.some(v=>v.Id===valueId)||!id(c.Id)||!Array.isArray(c.Attributes)||c.Attributes.length!==1||
      c.Attributes[0].Key!==product.attributeId||c.Attributes[0].Value!==valueId||
      typeof c.Sku!=='string'||!c.Sku||data.sku!==c.Sku||typeof c.Gtin!=='string'||!c.Gtin||data.gtin!==c.Gtin||
      money(data.price)!==product.priceMinor||(data.priceWithoutDiscount!==''&&money(data.priceWithoutDiscount)!==product.priceMinor)||
      !Array.isArray(data.appliedDiscounts)||data.appliedDiscounts.length!==0||c.OverriddenPrice!==null||c.AllowOutOfStockOrders!==false||
      !Number.isSafeInteger(c.StockQuantity)||c.StockQuantity<0||!Number.isSafeInteger(c.ReservedQuantity)||c.ReservedQuantity!==0)return 'unknown';
    return c.StockQuantity-c.ReservedQuantity>0?'in_stock':'out_of_stock';
  }catch{return 'unknown';}
}

export async function brandroomAvailability(html:string, url:string, signal:AbortSignal):Promise<Availability> {
  const p=brandroomProduct(html,url),s=readBrandroomSelection(url);
  if(!p||(s&&(s.productId!==p.productId||s.attributeId!==p.attributeId)))return 'unknown';
  const value=s?.variantId??(p.values.length===1?p.values[0]!.Id:null);
  if(!value||!p.values.some(v=>v.Id===value))return 'unknown';
  try{
    const endpoint=new URL('/product/productdetails_attributechange',url);
    endpoint.searchParams.set('productId',p.productId);endpoint.searchParams.set('product',p.productId);endpoint.searchParams.set('loadPicture','True');
    const body=new FormData();body.set('product_attribute_'+p.attributeId,value);
    const r=await retailerFetch(endpoint,{method:'POST',body,signal,redirect:'error',headers:{accept:'application/json'}});
    if(!r.ok){await r.body?.cancel();return 'unknown';}
    return brandroomStock(p,value,await r.json());
  }catch{return 'unknown';}
}
