import { extractAssignedJsonObject } from './assigned-json';
import { ticimaxStockConsistent } from './ticimax-stock-consistency';
import type { Availability } from './availability';
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positiveId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function ticimaxAvailability(html: string, priceMinor: number, currency: string): Availability {
  const json = extractAssignedJsonObject(html, 'productDetailModel');
  if (!json) return 'unknown';
  let m: Record<string, unknown>;
  try { const value: unknown = JSON.parse(json); if (!obj(value)) return 'unknown'; m = value; } catch { return 'unknown'; }
  if (!positiveId(m.productId) || m.productActive !== true || typeof m.productName !== 'string' || !m.productName.trim() ||
    m.productIsAsorti !== false || !number(m.productPriceKDVIncluded) ||
    Math.round(m.productPriceKDVIncluded * 100) !== priceMinor || String(m.productCurrency).toUpperCase() !== currency.toUpperCase()) return 'unknown';
  const variants = m.products === undefined || m.products === null
    ? (Array.isArray(m.productVariantData) && m.productVariantData.length ? [] : [m.product]) : m.products;
  if (!Array.isArray(variants) || !variants.length || variants.some(v => !obj(v))) return 'unknown';
  const rows = variants as Record<string, unknown>[];
  const ids = rows.map(v => v.id);
  if (ids.some(id => !positiveId(id)) || new Set(ids).size !== ids.length || !ids.includes(m.mainVariantId)) return 'unknown';
  // Variant option rows must not reference omitted products.
  if (Array.isArray(m.productVariantData) && m.productVariantData.some(v => !obj(v) || v.urunKartID !== m.productId || !ids.includes(v.urunID))) return 'unknown';
  if (rows.some(v => v.urunKartiId !== m.productId || !number(v.stokAdedi) || v.stokAdedi < 0 ||
    typeof v.aktif !== 'boolean' || !number(v.urunFiyatiOrjinal) || !number(v.urunFiyatiOrjinalKDV) ||
    Math.round((v.urunFiyatiOrjinal + v.urunFiyatiOrjinalKDV) * 100) !== priceMinor ||
    String(v.paraBirimiKodu).toUpperCase() !== currency.toUpperCase())) return 'unknown';
  if (!ticimaxStockConsistent(html, m, rows)) return 'unknown';
  if (rows.every(v => v.aktif === false || v.stokAdedi === 0)) return 'out_of_stock';
  const available = rows.every(v => v.aktif === true && v.hasPersonalization !== true && v.urunKampanyaAktif !== true &&
    (v.stokAdedi as number) >= Math.max(1, number(v.urunAdediMinimumDeger) ? v.urunAdediMinimumDeger : 1, number(v.uyeAlimMin) ? v.uyeAlimMin : 1));
  return available ? 'in_stock' : 'unknown';
}
