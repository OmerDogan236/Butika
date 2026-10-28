// A trimmed Dilvin product page (saved 2026-09-21): one JSON-LD Product whose offer
// is labelled with the retired code TRL, the embedded jspValue product data, the
// visible product price block and a recommended product with its own TL price.
export type DilvinPageOptions = {
  url: string;
  sku?: string;
  price?: string;
  label?: string;
  visible?: string | null;
  blocks?: number;
  embeddedSku?: string;
  embeddedPrice?: string;
  embeddedText?: string;
  recommended?: string;
};

export function dilvinPage(options: DilvinPageOptions): string {
  const { url, sku = '101A21246_K.Lacivert', price = '599.99', label = 'TRL', visible = '599,99 TL', blocks = 1,
    embeddedSku = sku, embeddedPrice = price, embeddedText = visible ?? '599,99 TL', recommended = '1.699,99 TL' } = options;
  const product = { '@context': 'http://schema.org/', '@type': 'Product', name: 'Degaje Yaka Top', sku, url,
    offers: { '@type': 'Offer', priceCurrency: label, price, url, availability: 'InStock' } };
  const block = visible === null ? ''
    : `<div class="product-price">\n <div class="price-info">\n  <div><span class="price-sales">${visible}</span></div>\n </div>\n</div>`;
  const embedded = { ProductID: 137072, SKU: embeddedSku, IsSaleable: true, Price: embeddedPrice, PriceText: embeddedText };
  return `<html><head><link rel="canonical" href="${url}" />
<script type="application/ld+json">${JSON.stringify(product)}</script></head><body>
<div class="product-code">Ürün Kodu: ${sku}</div>
${block.repeat(blocks)}
<div><span class="installment-price">4 X 150,00 taksit seçenekleri ile</span></div>
<script>var jspValue = ${JSON.stringify(embedded)};</script>
<div class="product relative" data-prdid="136633"><span class="price-sales">${recommended}</span></div>
</body></html>`;
}
