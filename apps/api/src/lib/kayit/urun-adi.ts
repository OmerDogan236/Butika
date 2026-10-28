// apps/api/src/lib/kayit/urun-adi.ts
// Telefonun gönderdiği sayfa başlığından ürün adını çıkarır. Eski uygulama sürümleri
// og:title / <title> gönderdiği için temizlik sunucuda yapılır.
// Uygulamanın bilerek eklediği " · Renk: X / Beden: S" eki KORUNUR.

export interface UrunAdi {
  ad: string;
  varyant: string | null;
}

const VARYANT_AYRACI = ' · ';
// 459,00 TL · 2.499,00 TL · ₺899 · 1199 TL
// Yalnız adın SONUNDAKİ fiyat atılır; "100 TL Hediye Çeki" gibi adın parçası olan tutar kalır.
const FIYAT = /\s*(?:₺\s*\d[\d.,]*|(?<!\d)\d+(?:\.\d{3})*(?:,\d{1,2})?\s*(?:TL\b|₺))\s*$/iu;

const bosluk = (s: string) => s.replace(/\s+/g, ' ').trim();
const sade = (s: string) => s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]/gu, '');

export function urunAdiAyir(title: string): UrunAdi {
  const i = title.lastIndexOf(VARYANT_AYRACI);
  if (i === -1) return { ad: bosluk(title), varyant: null };
  const varyant = bosluk(title.slice(i + VARYANT_AYRACI.length));
  return { ad: bosluk(title.slice(0, i)), varyant: varyant || null };
}

export function urunAdiTemizle(title: string, baglam: { butikAdi: string; alanAdi: string }): string {
  const ozgun = bosluk(title);
  if (!ozgun) return '';
  const { ad: ham, varyant } = urunAdiAyir(ozgun);
  const butik = sade(baglam.butikAdi);
  const alan = sade(baglam.alanAdi.replace(/^www\./i, ''));

  // " | " ile ayrılan parçalardan ilki ürün adıdır.
  const parcalar = ham.split(' | ').map(bosluk).filter(Boolean);
  // Butik adı başta yazılmışsa ("Manuka | Kırmızı Elbise") ürün adı ikinci parçadır.
  let ad = (butik && parcalar.length > 1 && sade(parcalar[0] ?? '') === butik ? parcalar[1] : parcalar[0]) ?? '';

  // Sonda kalan butik adı: "… / ZEN Pırlanta", "… TAKIM Mooi Butik"
  if (butik) {
    const kelimeler = ad.split(' ');
    for (let n = Math.min(4, kelimeler.length - 1); n >= 1; n--) {
      if (sade(kelimeler.slice(-n).join(' ')) === butik) {
        ad = bosluk(kelimeler.slice(0, -n).join(' ').replace(/[\s/|–-]+$/u, ''));
        break;
      }
    }
  }

  ad = bosluk(ad.replace(FIYAT, ''));

  const anlamsiz = !ad || sade(ad) === butik || sade(ad) === alan || sade(ad) === sade(baglam.alanAdi);
  if (anlamsiz) return ozgun;
  return varyant ? `${ad}${VARYANT_AYRACI}${varyant}` : ad;
}
