import type { YasAraligi } from '@butika/types';

// Admin'den gelen hedefYaslar değerini DB alanlarına çevirir.
// undefined (alan gelmedi) veya değişmediyse {} döner; yalnız GERÇEKTEN DEĞİŞTİYSE
// elle onaylanmış sayılır (yasGuven 'yuksek'). Boş liste/null = temizle.
// İstisna: yapay zekâ emin değilken ('dusuk') admin aynı değerle kaydederse tahmini
// onaylamıştır → yalnız yasGuven 'yuksek' olur ("Kontrol et" uyarısı kalkar).
export function hedefYasAlanlari(
  mevcut: readonly string[] | null,
  gelen: readonly YasAraligi[] | null | undefined,
  mevcutGuven: string | null = null,
):
  | { hedefYaslar: YasAraligi[] | null; yasGuven: 'yuksek' | null }
  | { yasGuven: 'yuksek' }
  | Record<string, never> {
  if (gelen === undefined) return {};
  const yeni = gelen === null || gelen.length === 0 ? null : [...new Set(gelen)];
  const eski = mevcut && mevcut.length > 0 ? mevcut : null;
  const ayni =
    yeni === null || eski === null
      ? yeni === eski
      : yeni.length === eski.length && yeni.every((y) => eski.includes(y));
  if (ayni) return yeni && mevcutGuven === 'dusuk' ? { yasGuven: 'yuksek' } : {};
  return { hedefYaslar: yeni, yasGuven: yeni ? 'yuksek' : null };
}
