import {test,expect} from 'bun:test';
import {akinonStockProof,readAkinonProduct} from './akinon-stock';
const url='https://store.test/set',product={pk:12,sku:'SET',absolute_url:'/set',product_type:'0',is_listable:true,form_schema:null,data_source:null,basket_offers:[],data_source_offers:[],price_type:'default',currency_type:'try',price:'5000',stock:4,in_stock:true,is_ready_to_basket:true};
const data={product,variants:[],offers:[]};
test('Akinon single-product stock requires identity, current price and no unresolved variants',()=>{
 expect(akinonStockProof(data,product,url,500000,'TRY')).toBe('in_stock');
 expect(akinonStockProof({...data,product:{...product,stock:0,in_stock:false,is_ready_to_basket:false}},product,url,500000,'TRY')).toBe('out_of_stock');
 for(const changed of [{...data,variants:[{}]},{...data,offers:[{}]},{...data,product:{...product,pk:13}},{...data,product:{...product,price:'4000'}},{...data,product:{...product,form_schema:[{}]}},{...data,product:{...product,is_ready_to_basket:false}}])expect(akinonStockProof(changed,product,url,500000,'TRY')).toBe('unknown');
 expect(akinonStockProof(data,product,url+'/other',500000,'TRY')).toBe('unknown');
});
test('Django escaped product data is decoded as JSON without executing storefront code',()=>{
 const escaped=JSON.stringify(product).replace(/"/g,'\\u0022');const html=`<script>var rawProduct = '${escaped}';</script>`;
 expect(readAkinonProduct(html)).toEqual(product);
 expect(readAkinonProduct(html+html)).toBeNull();
 expect(readAkinonProduct("var rawProduct = 'alert(1)';")).toBeNull();
});
