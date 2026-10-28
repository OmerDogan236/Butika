// apps/api/src/lib/kayit/temizlik-plani.ts
import { kayitHazirla } from './kayit-hazirla';

export interface KayitSatiri {
  id: string;
  url: string;
  title: string;
  butikAdi: string;
  sayfaTuru: string | null;
  trackedProductId: string | null;
}

export interface TemizlikAdimi {
  id: string;
  eskiAd: string;
  yeniAd: string;
  sayfaTuru: 'urun' | 'urun_degil';
  takibiBirak: boolean;
}

/** Mevcut kayıtlarda neyin değişeceğini çıkarır. Saf işlev; değişmeyecek satırı döndürmez. */
export function temizlikPlani(satirlar: KayitSatiri[]): TemizlikAdimi[] {
  const plan: TemizlikAdimi[] = [];
  for (const s of satirlar) {
    const h = kayitHazirla({ url: s.url, title: s.title, butikAdi: s.butikAdi });
    const takibiBirak = h.sayfaTuru === 'urun_degil' && s.trackedProductId !== null;
    if (h.title === s.title && h.sayfaTuru === s.sayfaTuru && !takibiBirak) continue;
    plan.push({ id: s.id, eskiAd: s.title, yeniAd: h.title, sayfaTuru: h.sayfaTuru, takibiBirak });
  }
  return plan;
}
