import type { PriceResolutionResult } from './price-provider';

// Stores whose page stock has no independent evidence yet. Their prices are still
// tracked, but stock is reported as unknown: no in-stock baseline is set and no
// restock alert is confirmed or fired. A wrong "sold out" can later produce a
// wrong "back in stock" just as a wrong "in stock" can, so both directions are
// withheld. Remove a host once a second signal verifies its stock.
const UNVERIFIED_STOCK_HOSTS = new Set(['big-lesson.com']);

export function hasUnverifiedStock(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return [...UNVERIFIED_STOCK_HOSTS].some(restricted => host === restricted || host.endsWith(`.${restricted}`));
  } catch {
    return false;
  }
}

export function withStockTrust(url: string, result: PriceResolutionResult): PriceResolutionResult {
  if (result.status !== 'success' || !hasUnverifiedStock(url)) return result;
  const { observation } = result;
  if (observation.availability === undefined || observation.availability === 'unknown') return result;
  return { ...result, observation: { ...observation, availability: 'unknown',
    method: `${observation.method ?? observation.provider}+stock-unverified-host` } };
}
