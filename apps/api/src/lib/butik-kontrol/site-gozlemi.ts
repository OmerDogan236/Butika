import { curlFetch } from '../curl-fetch';
import type { SiteGozlemi } from './siniflandir';

// Butik sitesine nazik okuma: yalnız ana sayfa (ağ hatasında 1 tekrar, 429'da
// bekleyip en çok 2 tekrar). Yönlendirmeler elle izlenir (en çok 8 adım); bir adım
// Butika alan adına giderse istek atılmaz ('butika_yonlendirme'). Gövdeler loglanmaz.
// Sunucu Almanya'da: Shopify'a pazarın ülkesi çerezle bildirilir, para birimi
// sayfanın o ülkeye gösterdiği etkin para biriminden okunur.

const ZAMAN_ASIMI_MS = 20_000;
const EN_COK_GOVDE = 1.5 * 1024 * 1024;
const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const BASLIKLAR = {
  'user-agent': SAFARI_UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
};
const SHOPIFY_IZI = /Shopify\.shop|cdn\.shopify\.com/;
const SHOPIFY_ETKIN_PARA = /Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Za-z]{3})"/;
const PAZAR_CEREZI: Record<string, string> = {
  TR: 'localization=TR; cart_currency=TRY',
  US: 'localization=US; cart_currency=USD',
};
// 429 (çok istek): Retry-After'a uyulur, en çok 30 sn
const COK_ISTEK_TEKRAR = 2;
const DNS_TEKRAR_MS = 5_000;
const COK_ISTEK_VARSAYILAN_MS = 10_000;
const COK_ISTEK_EN_COK_MS = 30_000;

export interface GozlemSecenekleri {
  /** Butiğin pazarı (TR/US): Shopify'a bu ülke olarak görünülür. */
  ulke?: string;
  /** Test için bekleme. */
  bekle?: (ms: number) => Promise<void>;
}
const EN_COK_YONLENDIRME = 8;
const YONLENDIRME_DURUMLARI = new Set([301, 302, 303, 307, 308]);

/** Tekrar denenmeyen, gözlemin kendisi olan hata (Butika'ya yönlenme, çok yönlendirme). */
class KesinHata extends Error {}

/** Butika'nın kendi alan adı mı? (İstek atılmaz.) */
export function butikaAlanAdiMi(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes('butika.ai');
  } catch {
    return /butika\.ai/i.test(url);
  }
}

/** Bun/Node ağ hatasını sınıflandırıcının tanıdığı kısa koda çevirir. */
function hataMetni(e: unknown): string {
  const err = e as { name?: string; code?: string; message?: string } | null;
  const ad = err?.name ?? '';
  if (ad === 'TimeoutError' || ad === 'AbortError') return 'timeout';
  const kod = err?.code ?? '';
  const esle: Record<string, string> = {
    ConnectionRefused: 'ECONNREFUSED',
    ConnectionClosed: 'ECONNRESET',
    FailedToOpenSocket: 'ECONNREFUSED',
    DNSFailure: 'ENOTFOUND',
  };
  const ana = esle[kod] ?? kod;
  const mesaj = String(err?.message ?? e).slice(0, 200);
  return ana ? `${ana}: ${mesaj}` : mesaj;
}

async function govdeOku(yanit: Response): Promise<string> {
  if (!yanit.body) return '';
  const okuyucu = yanit.body.getReader();
  const cozucu = new TextDecoder('utf-8');
  let metin = '';
  let okunan = 0;
  try {
    while (okunan < EN_COK_GOVDE) {
      const { done, value } = await okuyucu.read();
      if (done) break;
      const parca =
        value.byteLength + okunan > EN_COK_GOVDE ? value.subarray(0, EN_COK_GOVDE - okunan) : value;
      okunan += parca.byteLength;
      metin += cozucu.decode(parca, { stream: true });
    }
  } finally {
    await okuyucu.cancel().catch(() => {});
  }
  return metin + cozucu.decode();
}

async function iste(
  url: string,
  fetchImpl: typeof fetch,
  basliklar: Record<string, string>,
): Promise<Response> {
  return fetchImpl(url, {
    headers: basliklar,
    redirect: 'manual',
    signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
  });
}

/** Yönlendirmeleri elle izler; son yanıt ve adresi döner. */
async function izle(
  url: string,
  fetchImpl: typeof fetch,
  basliklar: Record<string, string>,
): Promise<{ yanit: Response; sonUrl: string }> {
  let simdiki = url;
  for (let adim = 0; ; adim++) {
    const yanit = await iste(simdiki, fetchImpl, basliklar);
    const konum = yanit.headers.get('location');
    if (!YONLENDIRME_DURUMLARI.has(yanit.status) || !konum) return { yanit, sonUrl: simdiki };
    await yanit.body?.cancel().catch(() => {});
    if (adim >= EN_COK_YONLENDIRME) throw new KesinHata('cok_fazla_yonlendirme');
    let sonraki: string;
    try {
      sonraki = new URL(konum, simdiki).href;
    } catch {
      throw new KesinHata(`gecersiz_yonlendirme: ${konum.slice(0, 200)}`);
    }
    if (butikaAlanAdiMi(sonraki))
      throw new KesinHata(`butika_yonlendirme: ${sonraki.slice(0, 200)}`);
    simdiki = sonraki;
  }
}

function beklemeSuresi(yanit: Response): number {
  const deger = yanit.headers.get('retry-after');
  const sn = deger === null ? Number.NaN : Number(deger);
  if (!Number.isFinite(sn) || sn < 0) return COK_ISTEK_VARSAYILAN_MS;
  return Math.min(sn * 1000, COK_ISTEK_EN_COK_MS);
}

export async function siteGozlemi(
  url: string,
  fetchImpl: typeof fetch = curlFetch,
  secenek: GozlemSecenekleri = {},
): Promise<SiteGozlemi> {
  const bos = { status: null, sonUrl: null, html: '', shopifyParaBirimi: null };
  if (butikaAlanAdiMi(url)) return { hata: 'butika_alan_adi_atlandi', ...bos };
  const cerez = secenek.ulke ? PAZAR_CEREZI[secenek.ulke] : undefined;
  const basliklar: Record<string, string> = cerez ? { ...BASLIKLAR, cookie: cerez } : BASLIKLAR;
  const bekle = secenek.bekle ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let sonHata = '';
  let cokIstek = 0;
  for (let deneme = 0; deneme < 2; deneme++) {
    try {
      const { yanit, sonUrl } = await izle(url, fetchImpl, basliklar);
      if (yanit.status === 429 && cokIstek < COK_ISTEK_TEKRAR) {
        cokIstek++;
        await yanit.body?.cancel().catch(() => {});
        await bekle(beklemeSuresi(yanit));
        deneme--;
        continue;
      }
      const html = await govdeOku(yanit);
      const shopify =
        yanit.ok && SHOPIFY_IZI.test(html)
          ? (SHOPIFY_ETKIN_PARA.exec(html)?.[1]?.toUpperCase() ?? null)
          : null;
      return { hata: null, status: yanit.status, sonUrl, html, shopifyParaBirimi: shopify };
    } catch (e) {
      if (e instanceof KesinHata) return { hata: e.message, ...bos };
      sonHata = hataMetni(e);
      // Geçici DNS hatası (1 Eki: Gebe Maternity) ikinci denemeden önce biraz beklesin
      if (deneme === 0 && sonHata.startsWith('ENOTFOUND')) await bekle(DNS_TEKRAR_MS);
    }
  }
  return { hata: sonHata, ...bos };
}
