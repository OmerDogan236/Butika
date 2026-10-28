import type { AppNotification } from '@butika/types';

// Kayıtlı sekmesinde bir ürünün yanında gösterilen son haber: fiyatı düştü ya da
// stoğa geldi. Sahip 29 Eyl testinde bildirimleri asıl Kayıtlı'da aradı; bildirim
// listesi Profil'de kalıyor, ama her haber kendi ürününün satırında da görünür.

export interface KayitHaberi {
  bildirimId: string;
  tur: AppNotification['type'];
  eskiFiyat: number | null;
  yeniFiyat: number;
  paraBirimi: string;
  tarih: string;
  okunmadi: boolean;
}

/** Okunmuş bir haber bu kadar gün satırda kalır; okunmamış olan okunana kadar kalır. */
export const HABER_GUN = 14;

const GUN_MS = 24 * 60 * 60 * 1000;

/**
 * Her kayıt adresi için en yeni haberi döndürür. Bildirimin `sourceUrl`'i, sunucuda
 * kullanıcının o ürün için kaydettiği son adrestir; Kayıtlı'daki satırın `url`'iyle
 * birebir eşleşir.
 */
export function kayitHaberleri(
  bildirimler: readonly AppNotification[],
  simdi: number = Date.now(),
): Map<string, KayitHaberi> {
  const sonuc = new Map<string, KayitHaberi>();
  const bakilan = new Set<string>();
  const sirali = [...bildirimler].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  for (const b of sirali) {
    // Yalnız adresin en yeni haberi önemli; o eskiyse daha eskileri de gösterilmez.
    if (bakilan.has(b.sourceUrl)) continue;
    bakilan.add(b.sourceUrl);
    const okunmadi = !b.readAt;
    if (!okunmadi && simdi - new Date(b.createdAt).getTime() > HABER_GUN * GUN_MS) continue;
    sonuc.set(b.sourceUrl, {
      bildirimId: b.id,
      tur: b.type,
      eskiFiyat: b.previousPriceMinor,
      yeniFiyat: b.newPriceMinor,
      paraBirimi: b.currency,
      tarih: b.createdAt,
      okunmadi,
    });
  }
  return sonuc;
}

/** Üstteki "Fiyatı düşenler ve stoğa gelenler" kutusu için sıralama: önce okunmamışlar, sonra en yeniler. */
export function haberSirasi(a: KayitHaberi, b: KayitHaberi): number {
  if (a.okunmadi !== b.okunmadi) return a.okunmadi ? -1 : 1;
  return new Date(b.tarih).getTime() - new Date(a.tarih).getTime();
}
