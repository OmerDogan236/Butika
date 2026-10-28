import { afterEach, expect, test } from 'bun:test';
import type { PriceProviderResult } from './price-provider';
import { resolveProductPrice } from './price-source-router';
import { shopifyPublicPriceProvider } from './providers/shopify-public-provider';
import { structuredHtmlPriceProvider } from './providers/structured-html-provider';
import { woocommerceStorePriceProvider } from './providers/woocommerce-store-provider';

// Pins how the stored currency takes part in Shopify arbitration. A newly tracked
// product has no expected currency; later checks pass the one stored by the first
// verified observation. Changing this changes currency safety for existing tracks.
const originals = {
  structuredCanHandle: structuredHtmlPriceProvider.canHandle, structuredGetPrice: structuredHtmlPriceProvider.getPrice,
  shopifyCanHandle: shopifyPublicPriceProvider.canHandle, shopifyGetPrice: shopifyPublicPriceProvider.getPrice,
  wooCanHandle: woocommerceStorePriceProvider.canHandle, wooGetPrice: woocommerceStorePriceProvider.getPrice,
};
afterEach(() => {
  structuredHtmlPriceProvider.canHandle = originals.structuredCanHandle;
  structuredHtmlPriceProvider.getPrice = originals.structuredGetPrice;
  shopifyPublicPriceProvider.canHandle = originals.shopifyCanHandle;
  shopifyPublicPriceProvider.getPrice = originals.shopifyGetPrice;
  woocommerceStorePriceProvider.canHandle = originals.wooCanHandle;
  woocommerceStorePriceProvider.getPrice = originals.wooGetPrice;
});
const url = 'https://store.test/products/dress';
const ok = (provider: 'structured_html' | 'shopify', priceMinor: number, currency: string): PriceProviderResult => ({
  status: 'success',
  observation: { priceMinor, currency, availability: 'in_stock', observedAt: new Date(), provider, method: provider === 'shopify' ? 'product-js+cart-js' : 'json-ld' },
});
const timeout: PriceProviderResult = { status: 'failure', reason: 'timeout', error: 'timed out' };
const shopifyMissing: PriceProviderResult = { status: 'failure', reason: 'not_found', error: 'Shopify endpoint HTTP 404' };
function providers(structured: PriceProviderResult, shopify: PriceProviderResult) {
  structuredHtmlPriceProvider.canHandle = () => true;
  structuredHtmlPriceProvider.getPrice = async () => structured;
  shopifyPublicPriceProvider.canHandle = () => true;
  shopifyPublicPriceProvider.getPrice = async () => shopify;
  woocommerceStorePriceProvider.canHandle = () => true;
  woocommerceStorePriceProvider.getPrice = async () => ({ status: 'failure', reason: 'not_found', error: 'no WooCommerce product' });
}

test('a Shopify-only read is accepted without an expected currency or in its own currency', async () => {
  providers(timeout, ok('shopify', 1990, 'USD'));
  expect(await resolveProductPrice({ url })).toMatchObject({ status: 'success', observation: { priceMinor: 1990, currency: 'USD', provider: 'shopify' } });
  expect(await resolveProductPrice({ url, expectedCurrency: 'USD' })).toMatchObject({ status: 'success', observation: { currency: 'USD' } });
});

test('a Shopify-only read in another currency conflicts with the stored currency', async () => {
  providers(timeout, ok('shopify', 1990, 'USD'));
  expect(await resolveProductPrice({ url, expectedCurrency: 'TRY' })).toMatchObject({ status: 'failed', reason: 'price_conflict' });
});

test('a page-only read follows the same stored-currency rule', async () => {
  providers(ok('structured_html', 12000, 'EUR'), shopifyMissing);
  expect(await resolveProductPrice({ url, expectedCurrency: 'TRY' })).toMatchObject({ status: 'failed', reason: 'price_conflict' });
  expect(await resolveProductPrice({ url, expectedCurrency: 'EUR' })).toMatchObject({ status: 'success', observation: { currency: 'EUR' } });
  expect(await resolveProductPrice({ url })).toMatchObject({ status: 'success', observation: { currency: 'EUR' } });
});

// Two agreeing sources may move a product to a new currency. recordPriceObservation
// then starts a new baseline; a drop is only counted within one baseline currency.
test('an exact page and Shopify match is kept even when the stored currency differs', async () => {
  providers(ok('structured_html', 12000, 'EUR'), ok('shopify', 12000, 'EUR'));
  expect(await resolveProductPrice({ url, expectedCurrency: 'TRY' })).toMatchObject({
    status: 'success', observation: { priceMinor: 12000, currency: 'EUR', provider: 'structured_html' },
  });
});
