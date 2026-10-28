import { expect, test } from 'bun:test';
import { extractTicimaxSelectedVariant } from './ticimax-selected-variant';
const url='https://store.test/dress';
const rows=[0,9].map((stock,i)=>({id:i+1,urunKartiId:72,stokAdedi:stock,aktif:true,urunFiyatiOrjinal:100,urunFiyatiOrjinalKDV:10,paraBirimiKodu:'TRY'}));
const options=rows.map(v=>({urunID:v.id,urunKartID:72,stokAdedi:Number(v.stokAdedi>0),urunAktif:true}));
const model={productId:72,productActive:true,productIsAsorti:false,productCurrency:'TRY',totalStockAmount:1,products:rows,productVariantData:options};
const page=(m:unknown=model,hidden:unknown=false)=>`<link rel="canonical" href="${url}"><script>var siteSettings=${JSON.stringify({urunAyar:{urunDetayAyar:{modeldeStokAdediGoster:hidden}}})};var productDetailModel=${JSON.stringify(m)};</script>`;
test('masked stock totals require explicit settings and matching option flags for every size',()=>{
 expect(extractTicimaxSelectedVariant(page(),url,'72','1')?.availability).toBe('out_of_stock');
 expect(extractTicimaxSelectedVariant(page(),url,'72','2')?.availability).toBe('in_stock');
 expect(extractTicimaxSelectedVariant(page(model,true),url,'72','2')).toBeNull();
 expect(extractTicimaxSelectedVariant(page(model,null),url,'72','2')).toBeNull();
 expect(extractTicimaxSelectedVariant(page({...model,totalStockAmount:2}),url,'72','2')).toBeNull();
 expect(extractTicimaxSelectedVariant(page({...model,productVariantData:options.slice(1)}),url,'72','2')).toBeNull();
 expect(extractTicimaxSelectedVariant(page({...model,productVariantData:[options[0],{...options[1],stokAdedi:0}]}),url,'72','2')).toBeNull();
 expect(extractTicimaxSelectedVariant(page({...model,productVariantData:[...options,{...options[1],stokAdedi:0}]}),url,'72','2')).toBeNull();
 expect(extractTicimaxSelectedVariant(page({...model,productVariantData:[options[0],{...options[1],urunAktif:false}]}),url,'72','2')).toBeNull();
});
