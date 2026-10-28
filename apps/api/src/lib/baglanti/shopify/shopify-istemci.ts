import { env } from '../../../env';
import {
  ShopifySorguHatasi,
  ShopifyYetkiHatasi,
  type ShopifyTokenlari,
  type ShopifyUygulamaAnahtari,
  tokenYenile,
} from './shopify-oauth';

export { ShopifySorguHatasi, ShopifyYetkiHatasi };

const YENILEME_ESIGI_MS = 5 * 60_000;
const ZAMAN_ASIMI_MS = 30_000;

export type ShopifyBaglanti = {
  magaza: string;
  uyg: ShopifyUygulamaAnahtari;
  tokenlar: ShopifyTokenlari;
  /** Yenilenen çift kalıcı yazılsın diye çağrılır (yenilemeYoneticisi yoksa). */
  tokenlarDegisti?: (t: ShopifyTokenlari) => Promise<void>;
  /**
   * Bağlantı başına tek yenileme: verilirse ağ yenilemesi (`agdanYenile`) bunun içinde yapılır.
   * Yönetici kalıcı kopyayı kilit altında okur; başka süreç çoktan yenilemişse onun çiftini
   * döner, değilse `agdanYenile` ile yenileyip yazar. Yenileme token'ı tek kullanımlıktır.
   */
  yenilemeYoneticisi?: (
    elimdeki: ShopifyTokenlari,
    agdanYenile: () => Promise<ShopifyTokenlari>,
  ) => Promise<ShopifyTokenlari>;
  /** Kalıcı kopyadaki güncel çift (yenileme reddedilince başka süreç yenilemiş mi diye bakılır). */
  guncelTokenlar?: () => Promise<ShopifyTokenlari | null>;
};

const ayniCift = (a: ShopifyTokenlari, b: ShopifyTokenlari) =>
  a.erisim === b.erisim && a.yenileme === b.yenileme;

export type Shopify = { sorgu<T>(query: string, variables?: object): Promise<T> };

type GraphqlYaniti = { data?: unknown; errors?: { message?: string; extensions?: { code?: string } }[] };

export function shopifyIstemci(baglanti: ShopifyBaglanti, fetchFn: typeof fetch = fetch): Shopify {
  let tokenlar = baglanti.tokenlar;
  const adres = `https://${baglanti.magaza}/admin/api/${env.SHOPIFY_API_SURUMU}/graphql.json`;

  /** Kalıcı (süresiz) token'da yenileme yoktur. */
  const yenilenebilir = () => tokenlar.yenileme !== null;

  async function yenile(): Promise<void> {
    const elimdeki = tokenlar;
    const yenileme = elimdeki.yenileme;
    if (yenileme === null) throw new ShopifyYetkiHatasi('shopify_yetki_reddedildi');
    const agdanYenile = () => tokenYenile(baglanti.magaza, baglanti.uyg, yenileme, fetchFn);
    try {
      if (baglanti.yenilemeYoneticisi) {
        tokenlar = await baglanti.yenilemeYoneticisi(elimdeki, agdanYenile);
      } else {
        tokenlar = await agdanYenile();
        await baglanti.tokenlarDegisti?.(tokenlar);
      }
    } catch (e) {
      // Reddedilen yenileme: başka bir süreç token'ı döndürüp yazmış olabilir; kalıcı kopyada
      // daha yeni çift varsa onunla devam edilir, yoksa yetki kaybı aynen yukarı çıkar.
      if (!(e instanceof ShopifyYetkiHatasi) || !baglanti.guncelTokenlar) throw e;
      const guncel = await baglanti.guncelTokenlar();
      if (!guncel || ayniCift(guncel, elimdeki)) throw e;
      tokenlar = guncel;
    }
  }

  /** `null` = yetki reddedildi (yalnız HTTP 401). */
  async function tekIstek(query: string, variables: object): Promise<GraphqlYaniti | null> {
    let res: Response;
    try {
      res = await fetchFn(adres, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-shopify-access-token': tokenlar.erisim },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
      });
    } catch {
      throw new ShopifySorguHatasi('shopify_ulasilamadi');
    }
    if (res.status === 401) return null;
    if (res.status === 429) throw new ShopifySorguHatasi('shopify_hiz_siniri');
    if (res.status >= 500) throw new ShopifySorguHatasi(`shopify_http_${res.status}`);
    const govde = (await res.json().catch(() => null)) as GraphqlYaniti | null;
    if (!res.ok && !govde?.errors?.length) throw new ShopifySorguHatasi(`shopify_http_${res.status}`);
    if (!govde) throw new ShopifySorguHatasi('shopify_yanit_okunamadi');
    const kodlar = govde.errors?.map((e) => e.extensions?.code) ?? [];
    if (kodlar.includes('THROTTLED')) throw new ShopifySorguHatasi('shopify_hiz_siniri');
    // ACCESS_DENIED = eksik kapsam/korunan veri onayı; token sorunu değil, bağlantı koparılmaz.
    if (kodlar.includes('ACCESS_DENIED')) throw new ShopifySorguHatasi('shopify_erisim_reddedildi');
    if (govde.errors?.length) {
      // Yalnız Shopify'ın hata iletileri; istek başlığı/token mesaja girmez.
      throw new ShopifySorguHatasi(govde.errors.map((e) => e.message ?? 'hata').join('; ').slice(0, 300));
    }
    if (govde.data == null) throw new ShopifySorguHatasi('shopify_yanit_okunamadi');
    return govde;
  }

  return {
    async sorgu<T>(query: string, variables: object = {}): Promise<T> {
      if (tokenlar.bitisAt && yenilenebilir() && new Date(tokenlar.bitisAt).getTime() - Date.now() < YENILEME_ESIGI_MS) {
        await yenile();
      }
      let yanit = await tekIstek(query, variables);
      if (!yanit) {
        await yenile();
        yanit = await tekIstek(query, variables);
        if (!yanit) throw new ShopifyYetkiHatasi('shopify_yetki_reddedildi');
      }
      return yanit.data as T;
    },
  };
}
