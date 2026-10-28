// Butik sitesi hatalarının ölçümü (webview_error) için yardımcılar.

// Hata sayılmayanlar (iOS): -999 yükleme yarıda kesildi (kullanıcı başka sayfaya geçti),
// 102 sayfa başka uygulamaya / indirmeye yönlendi (WebKit "frame load interrupted").
const SAYILMAYAN_KODLAR = new Set([-999, 102]);

export function sayilacakYuklemeHatasi(code: number | undefined): boolean {
  return code === undefined || !SAYILMAYAN_KODLAR.has(code);
}

/** Adresin yalnız alan adı (www'suz); okunamazsa null. Yol ve parametreler gönderilmez. */
export function hataAlanAdi(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host || null;
  } catch {
    return null;
  }
}

/** Aynı sayfa açıkken aynı hata (tür + kod + alan adı) bir kez sayılır; ilk seferde true. */
export function ilkKezMi(gorulen: Set<string>, anahtar: string): boolean {
  if (gorulen.has(anahtar)) return false;
  gorulen.add(anahtar);
  return true;
}
