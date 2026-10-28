import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Fiyat okumada butiğin pazarı (ülkesi).
 *
 * Sunucu yurtdışında (Hetzner, Almanya). Mağazalar ziyaretçiyi IP'den tanıyıp
 * yurtdışı fiyatı gösteriyor: avro/dolar ya da daha yüksek bir "yurtdışı TL"
 * listesi. Shopify pazarı çerezden de okur; o yüzden istekler pazar çerezini
 * taşır. Ticimax, Tsoft gibi altyapılar IP'ye bakar; onlarda pazarın para
 * birimi gelmezse gözlem reddedilir (yanlış fiyat ve sahte "fiyatı düştü"
 * bildirimi yerine "kontrol ediliyor"). Kalıcı çözüm: Türkiye çıkışlı bağlantı.
 */
const PAZAR_PARA_BIRIMI: Record<string, string> = { TR: 'TRY', US: 'USD' };

export function pazarParaBirimi(ulke: string | null | undefined): string | null {
  return (ulke && PAZAR_PARA_BIRIMI[ulke.trim().toUpperCase()]) || null;
}

export function pazarCerezi(ulke: string | null | undefined): string | null {
  const para = pazarParaBirimi(ulke);
  return para ? `localization=${ulke!.trim().toUpperCase()}; cart_currency=${para}` : null;
}

/** Uyuşmazlık varsa kayda yazılacak hata metni, yoksa null. */
export function pazarParaUyusmazligi(ulke: string | null | undefined, gelen: string): string | null {
  const beklenen = pazarParaBirimi(ulke);
  const para = gelen.trim().toUpperCase();
  return beklenen && para !== beklenen ? `pazar_para_birimi: ${beklenen} bekleniyordu, ${para} geldi` : null;
}

/** Fiyat işçisi her ürünü kendi pazarının bağlamında okur; mağaza istekleri bunu çerez olarak taşır. */
export const pazarBaglami = new AsyncLocalStorage<{ ulke: string }>();
