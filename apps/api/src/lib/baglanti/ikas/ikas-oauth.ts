import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../../env';

/** `butikBaglantilari.kimlikSifreli` bunun şifreli JSON'udur. */
export type IkasTokenlari = { erisim: string; yenileme: string; bitisAt: string };

/** Yetki yok/süresi doldu/geri alındı: butik yeniden bağlanmalı. Mesajda gizli değer olmaz. */
export class IkasYetkiHatasi extends Error {
  constructor(mesaj = 'ikas_yetki') {
    super(mesaj);
    this.name = 'IkasYetkiHatasi';
  }
}

/** ikas GraphQL yanıtı hata döndü (yetki dışı). */
export class IkasSorguHatasi extends Error {
  constructor(mesaj = 'ikas_sorgu') {
    super(mesaj);
    this.name = 'IkasSorguHatasi';
  }
}

const IZINLER = 'read_products,read_orders,read_inventories';
const ZAMAN_ASIMI_MS = 10_000;

function magazaDogrula(magazaAdi: string): void {
  if (!/^[a-z0-9-]{1,63}$/.test(magazaAdi)) throw new Error('gecersiz_magaza');
}

function hmacHex(mesaj: string): string {
  return createHmac('sha256', env.IKAS_CLIENT_SECRET ?? '').update(mesaj).digest('hex');
}

function hexEsit(a: string, b: string): boolean {
  // Gizli anahtar yoksa hiçbir imza geçerli sayılmaz.
  if (!env.IKAS_CLIENT_SECRET) return false;
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

async function tokenIste(
  magazaAdi: string,
  govde: Record<string, string>,
  fetchFn: typeof fetch,
  eskiYenileme?: string,
): Promise<IkasTokenlari> {
  magazaDogrula(magazaAdi);
  let res: Response;
  try {
    res = await fetchFn(`https://${magazaAdi}.myikas.com/api/admin/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...govde,
        client_id: env.IKAS_CLIENT_ID ?? '',
        client_secret: env.IKAS_CLIENT_SECRET ?? '',
      }),
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
    });
  } catch {
    // Ağ hatası/zaman aşımı geçicidir; butik yeniden bağlanmak zorunda değil.
    throw new IkasSorguHatasi('ikas_token_ulasilamadi');
  }
  if (res.status >= 500) throw new IkasSorguHatasi(`ikas_token_http_${res.status}`);
  const veri = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  } | null;
  const yenileme = veri?.refresh_token ?? eskiYenileme;
  if (!res.ok || !veri?.access_token || !yenileme) throw new IkasYetkiHatasi('ikas_token_alinamadi');
  return {
    erisim: veri.access_token,
    yenileme,
    bitisAt: new Date(Date.now() + (Number(veri.expires_in) || 14400) * 1000).toISOString(),
  };
}

export const ikasOAuth = {
  yetkiAdresi(magazaAdi: string, state: string): string {
    magazaDogrula(magazaAdi);
    const q = new URLSearchParams({
      client_id: env.IKAS_CLIENT_ID ?? '',
      redirect_uri: env.IKAS_YONLENDIRME_URL,
      scope: IZINLER,
      state,
    });
    return `https://${magazaAdi}.myikas.com/api/admin/oauth/authorize?${q}`;
  },

  koduTokenaCevir(magazaAdi: string, code: string, fetchFn: typeof fetch = fetch): Promise<IkasTokenlari> {
    return tokenIste(
      magazaAdi,
      { grant_type: 'authorization_code', code, redirect_uri: env.IKAS_YONLENDIRME_URL },
      fetchFn,
    );
  },

  tokenYenile(magazaAdi: string, yenileme: string, fetchFn: typeof fetch = fetch): Promise<IkasTokenlari> {
    return tokenIste(magazaAdi, { grant_type: 'refresh_token', refresh_token: yenileme }, fetchFn, yenileme);
  },

  /** Geri dönüşteki `signature` = hex HMAC-SHA256(code, client secret). */
  kodImzasiGecerli(code: string, signature: string): boolean {
    return hexEsit(hmacHex(code), signature);
  },

  /** Webhook gövdesindeki `signature` = hex HMAC-SHA256(data, client secret). */
  veriImzasiGecerli(data: string, signature: string): boolean {
    return hexEsit(hmacHex(data), signature);
  },

  /** Kurulum bildirimi: HMAC(storeName+merchantId+timestamp); timestamp 120 sn içinde. */
  kurulumImzasiGecerli(
    p: { storeName: string; merchantId: string; timestamp: string; signature: string },
    simdi: Date = new Date(),
  ): boolean {
    const sayi = Number(p.timestamp);
    if (!Number.isFinite(sayi)) return false;
    // Saniye ya da milisaniye gelebilir.
    const ms = sayi > 1e12 ? sayi : sayi * 1000;
    if (Math.abs(simdi.getTime() - ms) > 120_000) return false;
    return hexEsit(hmacHex(`${p.storeName}${p.merchantId}${p.timestamp}`), p.signature);
  },
};
