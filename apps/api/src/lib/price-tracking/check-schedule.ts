export const HEALTHY_RECHECK_MS = 24 * 60 * 60 * 1000;
// A sold-out size that somebody asked to be told about is checked more often.
export const RESTOCK_RECHECK_MS = 6 * 60 * 60 * 1000;
export const CHECK_LEASE_MS = 15 * 60 * 1000;

export function nextSuccessCheck(now: number, availability: string | undefined, restockAlert: boolean): Date {
  return new Date(now + (restockAlert && availability !== 'in_stock' ? RESTOCK_RECHECK_MS : HEALTHY_RECHECK_MS));
}

export function nextFailureCheck(now: number, failures: number, reason: string, retailerDeadline = 0): Date {
  const initial = reason === 'blocked' ? 30 * 60_000 : 15 * 60_000;
  const delay = reason === 'not_found' || reason === 'unsupported' ? HEALTHY_RECHECK_MS
    : Math.min(6 * 60 * 60_000, initial * 2 ** Math.min(10, Math.max(0, failures)));
  return new Date(Math.max(now + delay, retailerDeadline));
}
