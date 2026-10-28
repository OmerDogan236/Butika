import {test,expect} from 'bun:test';
import {farktorStockProof,farktorContext} from './farktor-stock';
const context={company:'Fr-12',id:'1'};
const data={fcode:'Fr-12',productId:1,status:1,nonSale:0,stockResume:0,priceRuleTimeType:0,priceRuleTimeStatus:0,priceRuleStockType:0,priceRuleStockStatus:0,daysOffer:0,rules:[],campaigns:[],priceSale:579.5,stockAll:5,stockWeb:2,sizes:[{productId:1,qty:2,priceSale:579.5,setWebSale:0},{productId:2,qty:3,priceSale:579.5,setWebSale:0}]};
const stock='@@1||2||0@@2||3||0##description##model##579,50||0,00##'+'##'.repeat(3);
test('Farktor requires matching live stock, complete sizes and the same public price',()=>{
 expect(farktorStockProof(data,stock,context,57950,'TRY')).toBe('in_stock');
 for(const changed of [{...data,fcode:'Fr-13'},{...data,priceSale:600},{...data,stockWeb:9},{...data,rules:[{}]},{...data,sizes:[data.sizes[0],data.sizes[0]]},{...data,sizes:[data.sizes[0],{...data.sizes[1],priceSale:700}]}])expect(farktorStockProof(changed,stock,context,57950,'TRY')).toBe('unknown');
 expect(farktorStockProof(data,stock.replace('2||3','2||1'),context,57950,'TRY')).toBe('unknown');
 expect(farktorStockProof(data,stock,context,57950,'USD')).toBe('unknown');
 const mixed={...data,stockAll:2,sizes:[data.sizes[0],{...data.sizes[1],qty:0}]};
 expect(farktorStockProof(mixed,stock.replace('2||3','2||0'),context,57950,'TRY')).toBe('unknown');
 const empty={...data,stockAll:0,stockWeb:0,sizes:data.sizes.map(v=>({...v,qty:0}))};
 expect(farktorStockProof(empty,stock.replace('1||2','1||0').replace('2||3','2||0'),context,57950,'TRY')).toBe('out_of_stock');
});
test('Farktor request context requires the canonical product and default TR price list',()=>{
 const html=`https://service.farktor.com/services/api/stock-control/ https://farktorapi.com/new/ <link rel="canonical" href="https://store.test/dress"><script>var FCODE="Fr-12";var SCODE="Fr-12-1";var PRODUCT_ID="1";var x_priceType="1";var Domestic="TR";var DomesticCURRENCY="TL";</script>`;
 expect(farktorContext(html,'https://store.test/dress')).toEqual({...context,store:'Fr-12-1'});
 expect(farktorContext(html,'https://store.test/other')).toBeNull();
 expect(farktorContext(html.replace('x_priceType="1"','x_priceType="2"'),'https://store.test/dress')).toBeNull();
});
