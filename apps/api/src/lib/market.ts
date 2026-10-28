import { countries } from '@butika/db';
import { codeToFlag, type Language, type Market } from '@butika/types';
import { asc, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from './db';

// Aktif pazarlar kısa süre bellekte cache'lenir — içerik endpoint'leri her
// istekte pazar çözer, DB'yi yormamak için. Admin değişikliklerinde invalidate.
let cache: { markets: Market[]; at: number } | null = null;
const TTL_MS = 60 * 1000;

function asLanguage(v: string): Language {
  return v === 'en' ? 'en' : 'tr';
}

export async function getActiveMarkets(): Promise<Market[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.markets;
  const rows = await db
    .select({
      code: countries.code,
      name: countries.name,
      defaultLanguage: countries.defaultLanguage,
    })
    .from(countries)
    .where(eq(countries.isActive, true))
    .orderBy(asc(countries.sortOrder), asc(countries.code));
  const markets: Market[] = rows.map((r) => ({
    code: r.code,
    name: r.name,
    flag: codeToFlag(r.code),
    defaultLanguage: asLanguage(r.defaultLanguage),
  }));
  cache = { markets, at: Date.now() };
  return markets;
}

export function invalidateMarketCache(): void {
  cache = null;
}

export async function isActiveMarket(code: string): Promise<boolean> {
  const cc = code.trim().toUpperCase();
  const markets = await getActiveMarkets();
  return markets.some((m) => m.code === cc);
}

// CF-IPCountry header'ı (Cloudflare ekler; turuncu bulut). Yoksa null. Local'de
// header olmadığından null döner → resolveMarket varsayılana düşer.
export function cfCountry(c: Context): string | null {
  const raw = c.req.header('CF-IPCountry');
  if (!raw) return null;
  const cc = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(cc) ? cc : null;
}

// Pazar çözümleme önceliği: explicit (geçerli + aktif) → CF-IPCountry (aktif) →
// varsayılan (en düşük sortOrder aktif pazar). Hiç aktif pazar yoksa 'TR'.
export async function resolveMarket(c: Context, explicit?: string | null): Promise<string> {
  const markets = await getActiveMarkets();
  const active = new Set(markets.map((m) => m.code));

  const exp = explicit?.trim().toUpperCase();
  if (exp && active.has(exp)) return exp;

  const cf = cfCountry(c);
  if (cf && active.has(cf)) return cf;

  return markets[0]?.code ?? 'TR';
}
