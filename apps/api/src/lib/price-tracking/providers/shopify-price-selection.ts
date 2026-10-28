import type { PriceProviderFailure } from '../price-provider';

type Selection = { priceMinor: number; variantId: string | null } | PriceProviderFailure;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function positiveInteger(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function reject(error: string, reason: PriceProviderFailure['reason'] = 'price_conflict'): PriceProviderFailure {
  return { status: 'failure', reason, error, stopFallback: true };
}

// product.price is a minimum, not necessarily the variant shown by the storefront.
// https://shopify.dev/docs/api/liquid/objects/product#product-price
export function selectShopifyPrice(product: Record<string, unknown>, url: string): Selection {
  if (positiveInteger(product.id) === null) {
    return { status: 'failure', reason: 'not_found', error: 'Not a Shopify product payload' };
  }
  const parsed = new URL(url);
  const requested = parsed.searchParams.getAll('variant');
  if (requested.length > 1 || (requested.length === 1 && !/^[1-9]\d*$/.test(requested[0]!))) {
    return reject('Invalid or repeated Shopify variant parameter', 'not_found');
  }
  const variantId = requested[0] ?? null;
  const segments = parsed.pathname.split('/').filter(Boolean);
  const index = segments.findIndex((s) => s.toLowerCase() === 'products');
  const handle = segments[index + 1];
  if (typeof product.handle === 'string' && product.handle !== decodeURIComponent(handle ?? '')) {
    return reject('Shopify product handle does not match requested product', 'not_found');
  }
  if (!Array.isArray(product.variants) || product.variants.length === 0) {
    return reject('Shopify variant data is missing', 'not_found');
  }
  if (variantId) {
    const matching = product.variants.filter((v) => record(v) && String(v.id) === variantId);
    if (matching.length !== 1 || !record(matching[0])) return reject('Requested Shopify variant not found or duplicated', 'not_found');
    const price = positiveInteger(matching[0].price);
    return price === null ? reject('Requested Shopify variant price is invalid', 'not_found') : { priceMinor: price, variantId };
  }
  // Ajax can truncate at 250 variants. A partial array cannot prove price equality.
  if (product.variants.length >= 250 || product.price_varies === true) {
    return reject('Shopify variant prices are ambiguous without an exact variant');
  }
  const prices = product.variants.map((v) => record(v) ? positiveInteger(v.price) : null);
  if (prices.some((p) => p === null)) return reject('Shopify variant price data is incomplete');
  if (new Set(prices).size !== 1) return reject('Shopify variants have different prices; exact variant required');
  const priceMinor = prices[0]!;
  for (const key of ['price', 'price_min', 'price_max']) {
    if (product[key] !== undefined && positiveInteger(product[key]) !== priceMinor) {
      return reject(`Shopify ${key} conflicts with variant prices`);
    }
  }
  return { priceMinor, variantId: null };
}
