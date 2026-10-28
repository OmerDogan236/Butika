import { retailerFetch } from './retailer-http';
import type { Availability } from './availability';

const supported = (url: URL) => /^(www\.)?(machka|ipekyol)\.com\.tr$/.test(url.hostname) && url.protocol === 'https:';
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;

export function aymarkaPagePrice(html: string, url: string) {
  // This field is the displayed product sales price, not related-product cards,
  // VIP price tables or a currency inferred from the domain.
  const prices = [...html.matchAll(/<div\b[^>]*data-test-id=["']product_price["'][^>]*>\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s+TL\s*<\/div>/g)];
  if (prices.length !== 1) return null;
  const priceMinor = Math.round(Number(prices[0]![1]!.replaceAll('.', '').replace(',', '.')) * 100);
  return aymarkaProduct(html,url,priceMinor,'TRY') ? {priceMinor,currency:'TRY'} : null;
}

export function readAymarkaSelection(raw: string) {
  const url = new URL(raw), values = url.searchParams.getAll('_butika_variant');
  if (!values.some(v => v.startsWith('aymarka:'))) return null;
  const match = values.length === 1 && supported(url) ? /^aymarka:([1-9]\d*):([1-9]\d*)$/.exec(values[0]!) : null;
  url.searchParams.delete('_butika_variant');
  return { sourceUrl: url.toString(), productId: match?.[1] ?? '', variantId: match?.[2] ?? '' };
}

// Public Next.js product model, bound to the requested route. Embedded stock is
// deliberately not used: the storefront refreshes it from stocks-by-product.
export function aymarkaProduct(html: string, raw: string, priceMinor: number, currency: string) {
  const url = new URL(raw);
  if (!supported(url) || currency !== 'TRY') return null;
  try {
    const scripts = [...html.matchAll(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)];
    if (scripts.length !== 1) return null;
    const data = JSON.parse(scripts[0]![1]!).props.pageProps.data;
    const product = data.response.product, routes = data.route.routeParts.product;
    if (data.response.isSuccess !== true || !positive(product.id) || product.isApproved !== true || product.isCompleted !== true ||
      !Array.isArray(routes) || routes.length !== 1 || routes[0].id !== product.id || routes[0].path !== product.routePath ||
      decodeURIComponent(url.pathname).replace(/\/$/, '') !== '/urun/' + product.routePath ||
      typeof product.salesPrice !== 'number' || !Number.isSafeInteger(priceMinor) || priceMinor <= 0 || Math.round(product.salesPrice * 100) !== priceMinor ||
      !Array.isArray(product.barcodes) || !product.barcodes.length || product.barcodes.length > 250) return null;
    const ids = product.barcodes.map((b: any) => b.id);
    if (ids.some((id: unknown) => !positive(id)) || new Set(ids).size !== ids.length ||
      product.barcodes.some((b: any) => !Array.isArray(b.stockTypeValues) || !b.stockTypeValues.length || b.stockTypeValues.some((v: any) => !positive(v.id)))) return null;
    return product as { id: number; barcodes: { id: number; stockTypeValues: { id: number; name: string }[] }[] };
  } catch { return null; }
}

export function aymarkaStock(product: NonNullable<ReturnType<typeof aymarkaProduct>>, response: unknown, barcodeId?: string): Availability {
  try {
    const payload = response as any, data = payload.data;
    if (payload.isSuccess !== true || data.productId !== product.id || !Array.isArray(data.stockAvailabilities)) return 'unknown';
    const rows = data.stockAvailabilities;
    if (rows.length !== product.barcodes.length || new Set(rows.map((r: any) => r.stockBarcodeId)).size !== rows.length) return 'unknown';
    for (const row of rows) {
      const barcode = product.barcodes.find(b => b.id === row.stockBarcodeId);
      if (!barcode || typeof row.isAvailable !== 'boolean' || !Array.isArray(row.stockTypeValueIds) ||
        row.stockTypeValueIds.length !== barcode.stockTypeValues.length ||
        new Set(row.stockTypeValueIds).size !== row.stockTypeValueIds.length ||
        !barcode.stockTypeValues.every(v => row.stockTypeValueIds.includes(v.id))) return 'unknown';
    }
    const selected = barcodeId ? rows.filter((r: any) => String(r.stockBarcodeId) === barcodeId) : rows;
    if (!selected.length) return 'unknown';
    return selected.every((r: any) => r.isAvailable) ? 'in_stock' : selected.every((r: any) => !r.isAvailable) ? 'out_of_stock' : 'unknown';
  } catch { return 'unknown'; }
}

export async function aymarkaAvailability(html: string, url: string, priceMinor: number, currency: string, signal: AbortSignal): Promise<Availability> {
  const selection = readAymarkaSelection(url), product = aymarkaProduct(html, url, priceMinor, currency);
  if (!product || (selection && String(product.id) !== selection.productId)) return 'unknown';
  try {
    const endpoint = new URL('/api/stocks-by-product', url);
    endpoint.searchParams.set('productId', String(product.id));
    const response = await retailerFetch(endpoint, { signal, redirect: 'error', headers: { accept: 'application/json' } });
    if (!response.ok) { await response.body?.cancel(); return 'unknown'; }
    return aymarkaStock(product, await response.json(), selection?.variantId);
  } catch { return 'unknown'; }
}
