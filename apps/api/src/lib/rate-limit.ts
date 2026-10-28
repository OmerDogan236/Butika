// Basit bellek-içi sabit-pencere hız sınırlayıcı (tek instance için yeterli).
const buckets = new Map<string, { count: number; reset: number }>();

/** true = izin ver, false = limit aşıldı. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}
