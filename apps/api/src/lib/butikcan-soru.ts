/** Kayda giren Butikcan sorusunun en fazla karakter sayısı. */
export const SORU_MAX = 500;

/**
 * Butikcan sorusunu kayda hazırlar: boşlukları sadeleştirir, uzun metni keser.
 * Geriye kalan metin boşsa null döner — o zaman kayıt yazılmaz.
 */
export function kirp(soru: string): string | null {
  const sade = soru.replace(/\s+/g, ' ').trim();
  if (!sade) return null;
  return sade.slice(0, SORU_MAX);
}
