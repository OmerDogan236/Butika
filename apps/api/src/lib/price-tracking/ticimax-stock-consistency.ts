import { extractAssignedJsonObject } from './assigned-json';

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Some storefronts deliberately replace public stock totals and option quantities with 0/1. */
export function ticimaxStockConsistent(html: string, model: Record<string, unknown>, rows: Record<string, unknown>[]): boolean {
  if (typeof model.totalStockAmount !== 'number' || !Number.isFinite(model.totalStockAmount)) return false;
  if (rows.some(v => typeof v.stokAdedi !== 'number' || !Number.isFinite(v.stokAdedi) || v.stokAdedi < 0)) return false;
  const total = rows.reduce((sum, v) => sum + (v.stokAdedi as number), 0);
  if (Math.abs(total - model.totalStockAmount) <= .000001) return true;
  // Never reinterpret an arbitrary inconsistent total as a boolean.
  if (model.totalStockAmount !== Number(total > 0)) return false;
  let settings: unknown;
  try { settings = JSON.parse(extractAssignedJsonObject(html, 'siteSettings') ?? 'null'); } catch { return false; }
  if (!object(settings) || !object(settings.urunAyar) || !object(settings.urunAyar.urunDetayAyar) ||
    settings.urunAyar.urunDetayAyar.modeldeStokAdediGoster !== false) return false;
  if (!Array.isArray(model.productVariantData) || !model.productVariantData.length) return false;
  const options = model.productVariantData;
  if (options.some(o => !object(o) || o.urunKartID !== model.productId || !rows.some(v => v.id === o.urunID))) return false;
  return rows.every(v => {
    const matches = options.filter(o => object(o) && o.urunID === v.id) as Record<string, unknown>[];
    return matches.length > 0 && matches.every(o => o.stokAdedi === Number((v.stokAdedi as number) > 0) && o.urunAktif === v.aktif);
  });
}
