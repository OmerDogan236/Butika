import { extractAssignedJsonObject } from './assigned-json';
import { ticimaxStockConsistent } from './ticimax-stock-consistency';
import { readStockMicrodata } from './microdata-stock';
import type { Availability } from './availability';
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const numeric = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function readTicimaxSelection(rawUrl: string) {
  const url = new URL(rawUrl);
  const values = url.searchParams.getAll('_butika_variant');
  if (!values.length) return null;
  const match = values.length === 1 ? /^ticimax:([1-9]\d*):([1-9]\d*)$/.exec(values[0]!) : null;
  url.searchParams.delete('_butika_variant');
  return { sourceUrl: url.toString(), productId: match?.[1] ?? '', variantId: match?.[2] ?? '' };
}

export function extractTicimaxSelectedVariant(html: string, sourceUrl: string, productId: string, variantId: string): {
  priceMinor: number; currency: string; availability: Availability;
} | null {
  const text = extractAssignedJsonObject(html, 'productDetailModel');
  if (!text) return null;
  let m: Record<string, unknown>;
  try { const data: unknown = JSON.parse(text); if (!obj(data)) return null; m = data; } catch { return null; }
  if (!positive(m.productId) || String(m.productId) !== productId || m.productActive !== true || m.productIsAsorti !== false) return null;
  const canonicals = readStockMicrodata(html).canonicals;
  if (canonicals.length !== 1) return null;
  try {
    const canonical = new URL(canonicals[0]!, sourceUrl), expected = new URL(sourceUrl);
    if (canonical.hostname.replace(/^www\./, '') !== expected.hostname.replace(/^www\./, '') ||
      decodeURIComponent(canonical.pathname).replace(/\/$/, '') !== decodeURIComponent(expected.pathname).replace(/\/$/, '')) return null;
  } catch { return null; }
  if (!Array.isArray(m.products) || !m.products.length || m.products.some(v => !obj(v))) return null;
  const rows = m.products as Record<string, unknown>[];
  const ids = rows.map(v => v.id);
  if (ids.some(id => !positive(id)) || new Set(ids).size !== ids.length || rows.some(v => v.urunKartiId !== m.productId || !numeric(v.stokAdedi) || v.stokAdedi < 0)) return null;
  if (!ticimaxStockConsistent(html, m, rows)) return null;
  if (!Array.isArray(m.productVariantData) || m.productVariantData.some(v => !obj(v) || v.urunKartID !== m.productId || !ids.includes(v.urunID))) return null;
  const selected = rows.find(v => String(v.id) === variantId);
  if (!selected || typeof selected.aktif !== 'boolean' || selected.hasPersonalization === true || selected.urunKampanyaAktif === true ||
    !numeric(selected.urunFiyatiOrjinal) || !numeric(selected.urunFiyatiOrjinalKDV) || selected.urunFiyatiOrjinalKDV < 0) return null;
  const currency = String(selected.paraBirimiKodu).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || currency !== String(m.productCurrency).toUpperCase()) return null;
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  if (digits !== 2) return null;
  const priceMinor = Math.round((selected.urunFiyatiOrjinal + selected.urunFiyatiOrjinalKDV) * 10 ** digits);
  if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0) return null;
  const stock = selected.stokAdedi as number;
  const minimum = Math.max(1, numeric(selected.urunAdediMinimumDeger) ? selected.urunAdediMinimumDeger : 1, numeric(selected.uyeAlimMin) ? selected.uyeAlimMin : 1);
  return { priceMinor, currency, availability: !selected.aktif || stock === 0 ? 'out_of_stock' : stock >= minimum ? 'in_stock' : 'unknown' };
}
