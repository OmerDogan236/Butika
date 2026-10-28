// apps/api/src/lib/kayit/kayit-hazirla.ts
import { type SayfaTuru, sayfaTuru } from './sayfa-turu';
import { urunAdiTemizle } from './urun-adi';

/** Kayıt isteğinden veritabanına yazılacak başlığı ve sayfa türünü çıkarır. Saf işlev. */
export function kayitHazirla(girdi: { url: string; title: string; butikAdi: string }): {
  title: string;
  sayfaTuru: SayfaTuru;
  takipEdilsin: boolean;
} {
  const tur = sayfaTuru(girdi.url);
  // Ürün olmayan sayfanın başlığı zaten ürün adı değildir; olduğu gibi kalır.
  if (tur === 'urun_degil') return { title: girdi.title.trim(), sayfaTuru: tur, takipEdilsin: false };
  let alanAdi = '';
  try {
    alanAdi = new URL(girdi.url).hostname;
  } catch {
    // sayfaTuru bozuk adresi zaten 'urun_degil' döndürür; buraya gelinmez
  }
  return {
    title: urunAdiTemizle(girdi.title, { butikAdi: girdi.butikAdi, alanAdi }),
    sayfaTuru: tur,
    takipEdilsin: true,
  };
}
