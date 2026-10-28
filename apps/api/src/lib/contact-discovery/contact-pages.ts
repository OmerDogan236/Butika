// Ana sayfadaki linklerden "iletisim bilgisi buralarda olur" sayfalarini secer.
// Amac bilincli olarak DAR: butun siteyi gezmiyoruz, en fazla birkac sayfa.

export type SayfaTuru = 'anasayfa' | 'iletisim' | 'hakkimizda' | 'kurumsal' | 'destek' | 'diger';

// Sira onemli: ilk eslesen tur kazanir, once en degerli sayfalar.
// `A` = kelimeler arasinda tire, alt cizgi ya da bosluk olabilir:
// "Bize Ulaşın", "bize-ulasin", "bize_ulasin" hepsi ayni sayfa.
const A = '[-_\\s]*';
const TUR_KALIPLARI: Array<[SayfaTuru, RegExp]> = [
  [
    'iletisim',
    new RegExp(
      `(iletisim|iletişim|bize${A}ulasin|bize${A}ulaşın|contact${A}us|contact|ulasim|ulaşım)`,
      'i',
    ),
  ],
  ['kurumsal', /(kurumsal|corporate|imprint|kunye|künye)/i],
  [
    'hakkimizda',
    new RegExp(
      `(hakkimizda|hakkımızda|hakkinda|hakkında|about${A}us|about|biz${A}kimiz|hikayemiz|our${A}story)`,
      'i',
    ),
  ],
  [
    'destek',
    new RegExp(
      `(musteri${A}hizmetleri|müşteri${A}hizmetleri|destek|support|yardim|yardım|sikca${A}sorulan|sıkça${A}sorulan|sss|faq|customer${A}service)`,
      'i',
    ),
  ],
];

// Bu sayfalarda iletisim bilgisi aramak bosuna — kalabalik yapar.
const ISTENMEYEN =
  /(\/(sepet|cart|checkout|odeme|login|giris|uye|account|hesap|blog|urun|product|collections?|kategori|category|search|arama|sepetim|favori|wishlist)(\/|$|\?))|(\.(pdf|jpg|png|webp|zip))/i;

export type AdaySayfa = {
  url: string;
  pageType: SayfaTuru;
};

function turBelirle(aday: string): SayfaTuru | null {
  for (const [tur, kalip] of TUR_KALIPLARI) {
    if (kalip.test(aday)) return tur;
  }
  return null;
}

// Ayni sayfaya iki kez gitmeyelim diye kaba bir normalizasyon.
function anahtar(url: URL): string {
  return `${url.origin}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
}

/**
 * Ana sayfa HTML'inden en fazla `limit` aday sayfa dondurur.
 * Ayni turden birden fazla sayfa varsa ilki alinir; turler onceliklerine gore siralanir.
 */
export function iletisimSayfalariniSec(html: string, baseUrl: string, limit = 4): AdaySayfa[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const bulunan = new Map<SayfaTuru, AdaySayfa>();
  const gorulen = new Set<string>();

  for (const eslesme of html.matchAll(
    /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi,
  )) {
    const ham = eslesme[1] ?? '';
    const metin = (eslesme[2] ?? '').replace(/<[^>]+>/g, ' ').trim();
    if (
      !ham ||
      ham.startsWith('mailto:') ||
      ham.startsWith('tel:') ||
      ham.startsWith('javascript:')
    )
      continue;

    let hedef: URL;
    try {
      hedef = new URL(ham, base);
    } catch {
      continue;
    }
    // Yalniz butigin kendi sitesi; disariya (instagram vb.) gitmiyoruz
    if (hedef.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
    if (hedef.protocol !== 'https:' && hedef.protocol !== 'http:') continue;
    if (ISTENMEYEN.test(hedef.pathname)) continue;

    const k = anahtar(hedef);
    if (gorulen.has(k) || k === anahtar(base)) continue;

    // Once link metnine, sonra adrese bak: "Bize Ulaşın" yazan link /page/12 olabilir
    const tur = turBelirle(metin) ?? turBelirle(hedef.pathname);
    if (!tur) continue;

    gorulen.add(k);
    if (!bulunan.has(tur)) bulunan.set(tur, { url: hedef.toString(), pageType: tur });
  }

  const sirali: SayfaTuru[] = ['iletisim', 'kurumsal', 'hakkimizda', 'destek'];
  return sirali
    .flatMap((tur) => {
      const sayfa = bulunan.get(tur);
      return sayfa ? [sayfa] : [];
    })
    .slice(0, limit);
}

/** Link bulunamazsa denenecek klasik adresler (site haritasi olmayan siteler icin). */
export function tahminiIletisimYollari(baseUrl: string): AdaySayfa[] {
  const yollar: Array<[string, SayfaTuru]> = [
    ['/iletisim', 'iletisim'],
    ['/contact', 'iletisim'],
    ['/hakkimizda', 'hakkimizda'],
  ];
  const cikti: AdaySayfa[] = [];
  for (const [yol, tur] of yollar) {
    try {
      cikti.push({ url: new URL(yol, baseUrl).toString(), pageType: tur });
    } catch {
      // gecersiz temel adres — sessizce atla
    }
  }
  return cikti;
}
