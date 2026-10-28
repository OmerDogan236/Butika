import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../../env';

/** Kalıcı token'da `yenileme` ve `bitisAt` null olur. */
export type ShopifyTokenlari = { erisim: string; yenileme: string | null; bitisAt: string | null };

/** Yetki yok/süresi doldu/geri alındı: butik yeniden bağlanmalı. Mesajda gizli değer olmaz. */
export class ShopifyYetkiHatasi extends Error {
  constructor(mesaj = 'shopify_yetki') {
    super(mesaj);
    this.name = 'ShopifyYetkiHatasi';
  }
}

/** Shopify geçici olarak yanıt vermedi (ağ, zaman aşımı, 5xx). */
export class ShopifySorguHatasi extends Error {
  constructor(mesaj = 'shopify_sorgu') {
    super(mesaj);
    this.name = 'ShopifySorguHatasi';
  }
}

export const SHOPIFY_KAPSAMLARI = 'read_products,read_orders,read_legal_policies';
const ZAMAN_ASIMI_MS = 10_000;
const MAGAZA_DESENI = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export type ShopifyUygulamaAnahtari = { clientId: string; secret: string };

/** Girdiyi 'xxx.myshopify.com' biçimine getirir; uymazsa null. */
export function shopifyMagazaAdi(girdi: string): string | null {
  const ad = girdi
    .trim()
    .toLowerCase()
    .replace(/^https:\/\//, '')
    .replace(/\/+$/, '');
  return MAGAZA_DESENI.test(ad) ? ad : null;
}

function magazaDogrula(magaza: string): void {
  if (!MAGAZA_DESENI.test(magaza)) throw new Error('gecersiz_magaza');
}

function esit(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Geri dönüş sorgusu: hmac hariç anahtara göre sıralı `k=v&...`, hex HMAC-SHA256. */
export function sorguImzasiGecerli(sorgu: URLSearchParams, secret: string): boolean {
  const hmac = sorgu.get('hmac');
  if (!hmac || !secret) return false;
  const mesaj = [...sorgu.entries()]
    .filter(([k]) => k !== 'hmac')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return esit(createHmac('sha256', secret).update(mesaj).digest('hex'), hmac);
}

/** Webhook: `X-Shopify-Hmac-Sha256` = base64 HMAC-SHA256(ham gövde). */
export function govdeImzasiGecerli(hamGovde: string, imzaB64: string, secret: string): boolean {
  if (!imzaB64 || !secret) return false;
  return esit(createHmac('sha256', secret).update(hamGovde).digest('base64'), imzaB64);
}

export function yetkiAdresi(magaza: string, clientId: string, state: string): string {
  magazaDogrula(magaza);
  const q = new URLSearchParams({
    client_id: clientId,
    scope: SHOPIFY_KAPSAMLARI,
    redirect_uri: env.SHOPIFY_YONLENDIRME_URL,
    state,
  });
  return `https://${magaza}/admin/oauth/authorize?${q}`;
}

async function tokenIste(
  magaza: string,
  govde: Record<string, string>,
  fetchFn: typeof fetch,
): Promise<ShopifyTokenlari> {
  magazaDogrula(magaza);
  let res: Response;
  try {
    res = await fetchFn(`https://${magaza}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(govde),
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
    });
  } catch {
    throw new ShopifySorguHatasi('shopify_token_ulasilamadi');
  }
  // Hız sınırı, zaman aşımı ve sunucu hataları geçicidir; diğer 4xx yetki sorunudur.
  if (res.status === 429 || res.status === 408 || res.status >= 500)
    throw new ShopifySorguHatasi(`shopify_token_http_${res.status}`);
  const veri = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  } | null;
  // 2xx ama gövde okunamadı (kesik yanıt, zaman aşımı): geçici; yetki kaybı sayılmaz.
  if (res.ok && veri === null) throw new ShopifySorguHatasi('shopify_token_yanit_okunamadi');
  if (!res.ok || !veri?.access_token) throw new ShopifyYetkiHatasi('shopify_token_alinamadi');
  const sure = Number(veri.expires_in);
  const sureli = Boolean(veri.refresh_token) && Number.isFinite(sure) && sure > 0;
  return {
    erisim: veri.access_token,
    yenileme: sureli ? (veri.refresh_token as string) : null,
    bitisAt: sureli ? new Date(Date.now() + sure * 1000).toISOString() : null,
  };
}

export function koduTokenaCevir(
  magaza: string,
  uyg: ShopifyUygulamaAnahtari,
  code: string,
  fetchFn: typeof fetch = fetch,
): Promise<ShopifyTokenlari> {
  return tokenIste(
    magaza,
    { client_id: uyg.clientId, client_secret: uyg.secret, code, expiring: '1' },
    fetchFn,
  );
}

export function tokenYenile(
  magaza: string,
  uyg: ShopifyUygulamaAnahtari,
  yenileme: string,
  fetchFn: typeof fetch = fetch,
): Promise<ShopifyTokenlari> {
  return tokenIste(
    magaza,
    {
      client_id: uyg.clientId,
      client_secret: uyg.secret,
      grant_type: 'refresh_token',
      refresh_token: yenileme,
    },
    fetchFn,
  );
}
