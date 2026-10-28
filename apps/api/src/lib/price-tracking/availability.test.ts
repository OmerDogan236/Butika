import { afterEach, expect, test } from 'bun:test';
import { shopifyAvailability, structuredAvailability, wooAvailability } from './availability';
import { resolveProductPrice } from './price-source-router';
import { structuredHtmlPriceProvider } from './providers/structured-html-provider';
import { shopifyPublicPriceProvider } from './providers/shopify-public-provider';

const url = 'https://store.test/products/dress';
const html = (offers: unknown, extra = {}) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', url, offers, ...extra })}</script>`;
const offer = { '@type': 'Offer', price: '100.00', priceCurrency: 'TRY', availability: 'https://schema.org/InStock' };

test.each(['OutOfStock', 'SoldOut', 'Discontinued'])('schema %s suppresses available stock', value => {
  expect(structuredAvailability(html({ ...offer, availability: `https://schema.org/${value}` }), 10000, 'TRY', url)).toBe('out_of_stock');
});
test('exact product offer confirms stock; backorders and incomplete evidence do not', () => {
  expect(structuredAvailability(html(offer), 10000, 'TRY', url)).toBe('in_stock');
  for (const offers of [
    { ...offer, availability: 'BackOrder' }, { ...offer, availability: undefined },
    { ...offer, price: 90 }, { ...offer, priceCurrency: 'USD' },
    { ...offer, '@type': 'AggregateOffer' }, [offer, { ...offer, availability: 'OutOfStock' }],
  ]) expect(structuredAvailability(html(offers), 10000, 'TRY', url)).toBe('unknown');
});
test('another product or a variant cannot borrow product-level availability', () => {
  expect(structuredAvailability(html(offer, { url: '/products/other' }), 10000, 'TRY', url)).toBe('unknown');
  expect(structuredAvailability(html(offer) + html(offer), 10000, 'TRY', url)).toBe('unknown');
  expect(structuredAvailability(html(offer), 10000, 'TRY', `${url}?variant=5`)).toBe('unknown');
});
test('Shopify selects exact variant stock, mixed sizes without a selection stay unknown', () => {
  const product = { variants: [{ id: 1, available: true }, { id: 2, available: false }] };
  expect(shopifyAvailability(product, '1')).toBe('in_stock');
  expect(shopifyAvailability(product, '2')).toBe('out_of_stock');
  expect(shopifyAvailability(product, null)).toBe('unknown');
  expect(shopifyAvailability(product, '9')).toBe('unknown');
});
test('Woo stock requires purchasable, not backordered, simple product', () => {
  const product = { type: 'simple', is_in_stock: true, is_purchasable: true, is_on_backorder: false, stock_availability: { class: 'in-stock' } };
  expect(wooAvailability(product)).toBe('in_stock');
  expect(wooAvailability({ ...product, is_in_stock: false })).toBe('out_of_stock');
  expect(wooAvailability({ ...product, is_on_backorder: true })).toBe('unknown');
  expect(wooAvailability({ ...product, type: 'variable' })).toBe('unknown');
  expect(wooAvailability({ ...product, stock_availability: { class: 'available-on-backorder' } })).toBe('unknown');
  expect(wooAvailability({})).toBe('unknown');
});

const originalStructured = structuredHtmlPriceProvider.getPrice;
const originalShopify = shopifyPublicPriceProvider.getPrice;
test('verified IKAS stock survives a legacy Shopify-shaped URL with a missing Shopify endpoint',async()=>{
  structuredHtmlPriceProvider.getPrice=async()=>({status:'success',observation:{priceMinor:10000,currency:'TRY',provider:'structured_html',method:'ikas',observedAt:new Date(),availability:'in_stock'}});
  shopifyPublicPriceProvider.getPrice=async()=>({status:'failure',reason:'not_found',error:'HTTP 404'});
  expect(await resolveProductPrice({url})).toMatchObject({status:'success',observation:{availability:'in_stock'}});
  expect(await resolveProductPrice({url:`${url}?variant=123`})).toMatchObject({status:'success',observation:{availability:'unknown'}});
  shopifyPublicPriceProvider.getPrice=async()=>({status:'failure',reason:'timeout',error:'timeout'});
  expect(await resolveProductPrice({url})).toMatchObject({status:'success',observation:{availability:'unknown'}});
});
afterEach(() => { structuredHtmlPriceProvider.getPrice = originalStructured; shopifyPublicPriceProvider.getPrice = originalShopify; });
test.each([10000, 10001, 100000])('Shopify stock survives price arbitration for HTML price %d', async priceMinor => {
  structuredHtmlPriceProvider.getPrice = async () => ({ status: 'success', observation: {
    priceMinor, currency: 'TRY', provider: 'structured_html', observedAt: new Date(), availability: 'in_stock',
  } });
  shopifyPublicPriceProvider.getPrice = async () => ({ status: 'success', observation: {
    priceMinor: 10000, currency: 'TRY', provider: 'shopify', observedAt: new Date(), availability: 'out_of_stock',
  } });
  expect(await resolveProductPrice({ url })).toMatchObject({ status: 'success', observation: { availability: 'out_of_stock' } });
});
test('Shopify API outage cannot certify variant stock through HTML fallback', async () => {
  structuredHtmlPriceProvider.getPrice = async () => ({ status: 'success', observation: {
    priceMinor: 10000, currency: 'TRY', provider: 'structured_html', observedAt: new Date(), availability: 'in_stock',
  } });
  shopifyPublicPriceProvider.getPrice = async () => ({ status: 'failure', reason: 'timeout', error: 'timeout' });
  expect(await resolveProductPrice({ url })).toMatchObject({ status: 'success', observation: { availability: 'unknown' } });
});

test('selected Shopify size keeps its exact price instead of a near-equivalent default price',async()=>{
  structuredHtmlPriceProvider.getPrice=async()=>({status:'success',observation:{priceMinor:10001,currency:'TRY',provider:'structured_html',observedAt:new Date(),availability:'in_stock'}});
  shopifyPublicPriceProvider.getPrice=async()=>({status:'success',observation:{priceMinor:10000,currency:'TRY',provider:'shopify',observedAt:new Date(),availability:'in_stock'}});
  expect(await resolveProductPrice({url:`${url}?variant=123`})).toMatchObject({status:'success',observation:{priceMinor:10000,provider:'shopify'}});
});
