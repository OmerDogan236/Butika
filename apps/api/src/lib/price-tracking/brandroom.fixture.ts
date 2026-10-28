// Synthetic product responses for deterministic parser and scheduler tests.
export const brandroomFixture = (price=100,available=true) => {
  const productId='a'.repeat(24),attributeId='b'.repeat(24),valueId='c'.repeat(24),otherId='d'.repeat(24);
  const url='https://www.brandroom.com.tr/test-dress';
  const attribute={ProductId:productId,Id:attributeId,HasCondition:false,IsRequired:true,AttributeControlType:2,Values:[{Id:valueId,Name:'36',PriceAdjustmentValue:0},{Id:otherId,Name:'38',PriceAdjustmentValue:0}]};
  const html=`<link rel=canonical href=${url}><form id=product-details-form action=/test-dress><div itemscope itemtype=http://schema.org/Product data-productid=${productId}><div itemscope itemtype=http://schema.org/Offer><meta itemprop=price content=${price}.00><meta itemprop=priceCurrency content=TRY></div></div></form><script>this.ProductAttributes = ${JSON.stringify([attribute])};</script>`;
  const response={sku:'DRESS-36',gtin:'123456789',price:`${price},00 TL`,priceWithoutDiscount:'',appliedDiscounts:[],selectedProductAttributeCombination:{Id:'e'.repeat(24),Attributes:[{Key:attributeId,Value:valueId}],Sku:'DRESS-36',Gtin:'123456789',OverriddenPrice:null,StockQuantity:available?2:0,ReservedQuantity:0,AllowOutOfStockOrders:false}};
  return {url,selectedUrl:`${url}?_butika_variant=brandroom:${productId}:${attributeId}:${valueId}`,html,response,attribute,valueId,otherId};
};
