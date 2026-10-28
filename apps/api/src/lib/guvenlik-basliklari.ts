import type { MiddlewareHandler } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

// Uygulama geneli güvenlik başlıkları. Tek istisna: ikas paneli kurulum sayfasını
// iframe içinde açar; yalnız o yolda ikas alan adlarına çerçeve izni verilir.
export const IKAS_KURULUM_YOLU = '/katilim/ikas/kurulum';

const varsayilan = secureHeaders();
const ikasCercevesi = secureHeaders({
  xFrameOptions: false,
  contentSecurityPolicy: {
    frameAncestors: ["'self'", 'https://*.myikas.com', 'https://*.ikas.com'],
  },
});

export const guvenlikBasliklari: MiddlewareHandler = (c, next) =>
  c.req.path === IKAS_KURULUM_YOLU ? ikasCercevesi(c, next) : varsayilan(c, next);
