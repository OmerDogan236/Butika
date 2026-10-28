// Telefonun paylaşım menüsünden Butika'ya gelen metni çözer ("Paylaş… → Butika").
// Instagram profil linki, Instagram gönderi/reel linki ya da düz bir web adresi olabilir;
// metnin içinde açıklama da bulunabilir, ilk tanınan link kullanılır.

export type PaylasimHedefi =
  | { tur: 'instagram_profil'; hesap: string }
  | { tur: 'instagram_gonderi'; kod: string }
  | { tur: 'site'; alan: string; url: string; adres: string };

// Instagram'da hesap adı gibi görünen ama hesap olmayan yollar.
const HESAP_OLMAYAN = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'stories',
  'explore',
  'accounts',
  'direct',
  'about',
  'legal',
  'developer',
  'share',
  's',
]);

const LINK = /https?:\/\/[^\s<>"']+/gi;

/**
 * "www." ve sondaki nokta olmadan, küçük harf alan adı. Adres tek yerde, URL ayrıştırıcısıyla
 * çözülür (eşleştirme ve kaydedilen adres aynı kuralı kullansın); kullanıcı adı/şifre içeren
 * ("site.com@baska.com") ya da http(s) olmayan adresler reddedilir. Geçersizse null.
 */
export function alanAdi(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null;
  const alan = u.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  return alan.includes('.') && !alan.startsWith('[') ? alan : null;
}

const IZLEME = /^(utm_[a-z]+|igsh|igshid|fbclid|gclid|ttclid|mc_[a-z]+|_ga)$/i;

function temizAdres(url: string): string {
  const u = new URL(url);
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (IZLEME.test(k)) u.searchParams.delete(k);
  if (u.protocol === 'http:') u.protocol = 'https:';
  return u.toString();
}

function instagramYolu(url: string): PaylasimHedefi | null {
  const m = /^https?:\/\/(?:www\.|m\.)?instagram\.com\/([^?#\s]*)/i.exec(url);
  if (!m) return null;
  const parcalar = (m[1] ?? '').split('/').filter(Boolean);
  const ilk = parcalar[0]?.toLowerCase();
  if (!ilk) return null;
  // /p/<kod>, /reel/<kod>, /<hesap>/p/<kod> biçimleri
  const gonderiIndeksi = parcalar.findIndex((x) => ['p', 'reel', 'reels', 'tv'].includes(x.toLowerCase()));
  if (gonderiIndeksi >= 0) {
    const kod = parcalar[gonderiIndeksi + 1];
    return kod && /^[A-Za-z0-9_-]+$/.test(kod) ? { tur: 'instagram_gonderi', kod } : null;
  }
  if (HESAP_OLMAYAN.has(ilk)) return null;
  // Instagram hesap adı: harf, rakam, nokta, alt çizgi; en çok 30 karakter.
  if (!/^[a-z0-9._]{1,30}$/.test(ilk)) return null;
  return { tur: 'instagram_profil', hesap: ilk };
}

export function paylasimiCoz(metin: string): PaylasimHedefi | null {
  const linkler = metin.match(LINK) ?? [];
  for (const ham of linkler) {
    const url = ham.replace(/[).,;!?]+$/, '');
    const alan = alanAdi(url);
    if (!alan) continue;
    if (alan === 'instagram.com' || alan.endsWith('.instagram.com')) {
      const hedef = instagramYolu(url);
      if (hedef) return hedef;
      continue;
    }
    // Instagram'ın kendi kısa/yönlendirme alanları butik sitesi değildir.
    if (alan === 'instagr.am' || alan === 'l.instagram.com' || alan.endsWith('facebook.com')) continue;
    // url: butiğin adresi (yalnız alan adından kurulur). adres: paylaşılan sayfanın kendisi
    // (ürün sayfasıysa ürün kaydı için), izleme parametreleri ve # atılmış hâli.
    return { tur: 'site', alan, url: `https://${alan}`, adres: temizAdres(url) };
  }
  return null;
}
