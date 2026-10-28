import type { Context } from 'hono';

// Gerçek ziyaretçi IP'si — Cloudflare + nginx arkasında.
// Öncelik: Cloudflare'in CF-Connecting-IP → X-Forwarded-For (ilk IP).
export function getClientIp(c: Context): string | null {
  const cf = c.req.header('CF-Connecting-IP');
  if (cf) return cf.trim();
  const xff = c.req.header('X-Forwarded-For');
  if (xff) return xff.split(',')[0]?.trim() || null;
  return null;
}

export function getUserAgent(c: Context): string | null {
  return c.req.header('User-Agent')?.slice(0, 500) || null;
}
