import { kokAlanAdi } from './alan-adi';

export type BulguTuru =
  | 'acilmiyor'
  | 'park_satilik'
  | 'magaza_kapali'
  | 'baska_alan_adi'
  | 'para_birimi'
  | 'marka_uyusmuyor'
  | 'moda_disi'
  | 'elle_bak';

export type Onem = 'yuksek' | 'orta' | 'dusuk' | 'bilgi';

export interface SiteGozlemi {
  hata: string | null;
  status: number | null;
  sonUrl: string | null;
  html: string;
  /** Shopify sayfasının pazarın ülkesine gösterdiği etkin para birimi (Shopify değilse null). */
  shopifyParaBirimi: string | null;
}

export interface Butik {
  id: string;
  ad: string;
  url: string;
  ulke: 'TR' | 'US' | string;
}

export interface HamBulgu {
  tur: BulguTuru;
  kanit: string;
  /** Karşılaştırma/yoksay için normalize değer (yeni alan adı, para birimi...). */
  deger: string;
}

export interface Ozet {
  kokAlanAdi: string | null;
  paraBirimi: string | null;
  baslik: string | null;
  acildi: boolean;
}

const TR_HARITA: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  ş: 's',
  Ş: 's',
  ğ: 'g',
  Ğ: 'g',
  ü: 'u',
  Ü: 'u',
  ö: 'o',
  Ö: 'o',
  ç: 'c',
  Ç: 'c',
};

/** Küçük harf, Türkçe harfler ASCII, harf/rakam dışı atılmaz (boşluk kalır). */
function asciiBoslukLu(s: string): string {
  return s
    .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => TR_HARITA[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sade(s: string): string {
  return asciiBoslukLu(s).replace(/ /g, '');
}

const ADLANDIRILMIS: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  euro: '€',
  pound: '£',
  ccedil: 'ç',
  Ccedil: 'Ç',
  ouml: 'ö',
  Ouml: 'Ö',
  uuml: 'ü',
  Uuml: 'Ü',
};

function kodCozumle(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number.parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ADLANDIRILMIS[n] ?? m);
}

/** script, style ve yorumlar atılmış HTML. */
function temizle(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

function gorunurMetin(html: string): string {
  return kodCozumle(temizle(html).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function metaIcerik(html: string, anahtar: string, ozellik: 'property' | 'name'): string | null {
  const DEGER = `(?:"([^"]*)"|'([^']*)')`;
  const ad = `${ozellik}\\s*=\\s*(?:"${anahtar}"|'${anahtar}')`;
  const a = new RegExp(`<meta[^>]*?${ad}[^>]*?content\\s*=\\s*${DEGER}`, 'i').exec(html);
  const b = new RegExp(`<meta[^>]*?content\\s*=\\s*${DEGER}[^>]*?${ad}`, 'i').exec(html);
  const m = a ?? b;
  if (!m) return null;
  return kodCozumle(m[1] ?? m[2] ?? '');
}

function etiketMetni(html: string, etiket: string): string | null {
  const m = new RegExp(`<${etiket}[^>]*>([\\s\\S]*?)<\\/${etiket}>`, 'i').exec(html);
  if (!m) return null;
  const t = kodCozumle((m[1] ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  return t || null;
}

function baslikBul(html: string): string | null {
  return etiketMetni(html, 'title')?.slice(0, 120) ?? null;
}

const EN_AZ_SEMBOL = 3;

function paraBirimiBul(html: string, shopify: string | null): string | null {
  if (shopify) return shopify.toUpperCase();
  const meta =
    /(?:og:price:currency|product:price:currency)["'][^>]*content=["']([A-Za-z]{3})["']/i.exec(
      html,
    ) ??
    /content=["']([A-Za-z]{3})["'][^>]*(?:og:price:currency|product:price:currency)/i.exec(html) ??
    /"priceCurrency"\s*:\s*"([A-Za-z]{3})"/i.exec(html);
  if (meta?.[1]) return meta[1].toUpperCase();
  // Yalnız rakama bitişik semboller sayılır (menü/ikon/script gürültüsü sayılmaz)
  const metin = gorunurMetin(html);
  const say = (sembol: string, kod?: string) => {
    const k = kod ? `|${kod}` : '';
    const sem = `(?:${sembol}${k})`;
    // tek geçişte, çakışmadan: "₺100" ya da "100 TL"
    const re = new RegExp(`${sem}\\s?\\d[\\d.,]*|\\d[\\d.,]*\\s?${sem}(?![A-Za-z])`, 'gi');
    return (metin.match(re) ?? []).length;
  };
  const sayilar: [string, number][] = [
    ['TRY', say('₺|\\bTL\\b', '\\bTRY\\b')],
    ['EUR', say('€', '\\bEUR\\b')],
    ['GBP', say('£', '\\bGBP\\b')],
    ['USD', say('\\$', '\\bUSD\\b')],
  ];
  const [kod, adet] = sayilar.reduce((en, x) => (x[1] > en[1] ? x : en));
  return adet >= EN_AZ_SEMBOL ? kod : null;
}

const MODA_KELIMELERI = [
  'giyim',
  'elbise',
  'butik',
  'moda',
  'kadin',
  'ayakkabi',
  'canta',
  'abiye',
  'tesettur',
  'fashion',
  'dress',
  'clothing',
  'boutique',
  'wear',
  'tisort',
  'pantolon',
  'bluz',
  'etek',
  'ceket',
  'triko',
  'gomlek',
  'esofman',
  'aksesuar',
  'taki',
  'jewelry',
  'shirt',
  'jeans',
  'mayo',
  'bikini',
];

// baski yalnız "baskı ve ..." / "baskı &" bağlamında; matbaa tek başına yeter
const MODA_DISI_KELIMELER = [
  'matbaa',
  'baski ve',
  'ambalaj',
  'mimarlik',
  'architecture',
  'psikolog',
  'klinik',
  'avukat',
  'seccade',
  'tespih',
  'mobilya',
  'furniture',
  'lokum',
  'cikolata',
  'brownie',
  'kahve',
  'restoran',
  'oto',
  'yedek parca',
  'emlak',
  'sigorta',
  'kasino',
  'bahis',
];

function modaDisiKelime(metin: string): string | null {
  const t = ` ${asciiBoslukLu(metin.replace(/&/g, ' ve '))} `;
  if (MODA_KELIMELERI.some((k) => t.includes(k))) return null;
  for (const k of MODA_DISI_KELIMELER) {
    // "oto" yalnız tam kelime; diğerleri kelime başı (Türkçe ekler için)
    const re = k === 'oto' ? /\boto\b/ : new RegExp(`\\b${k}`);
    if (re.test(t)) return k;
  }
  return null;
}

const GENEL_KELIMELER = new Set([
  'butik',
  'boutique',
  'moda',
  'giyim',
  'store',
  'shop',
  'the',
  'by',
  'official',
  'online',
]);

function ozetUret(b: Butik, g: SiteGozlemi, acildi: boolean): Ozet {
  return {
    kokAlanAdi: kokAlanAdi(g.sonUrl ?? b.url),
    paraBirimi: paraBirimiBul(g.html, g.shopifyParaBirimi),
    baslik: baslikBul(g.html),
    acildi,
  };
}

const KORUMA_IZLERI = /Just a moment|cf-challenge|cf_chl|Attention Required/i;
const PARK_IZLERI =
  /parkingcrew|sedoparking|window\.parking|domain parking|parked domain|domain is for sale|buy this domain|bu alan adı satılık/i;
const DAN_COM = /(?<![\w.-])dan\.com\b/i;
const URUN_IZLERI = /sepete ekle|add to cart|product/i;
const KAPALI_IZLERI =
  /This store is unavailable|store is unavailable|geçici olarak kullanıma kapatılmıştır/i;
const KORUMA_DURUMLARI = new Set([401, 403, 429]);
// Kontrol sunucusu Almanya'da: bu uzantılara yönlenme konuma göre olabilir
const BOLGESEL_UZANTILAR = new Set(['de', 'eu', 'at', 'ch', 'nl', 'fr', 'it', 'es', 'be']);
const SUNUCU_NOTU = "kontrol sunucusu Almanya'da, Türkiye'den bakınca farklı olabilir";

const uzanti = (kok: string) => kok.split('.').at(-1) ?? '';
const etiket = (kok: string) => kok.split('.')[0] ?? '';

export function siniflandir(b: Butik, g: SiteGozlemi): { bulgular: HamBulgu[]; ozet: Ozet } {
  const tek = (tur: BulguTuru, kanit: string, acildi: boolean) => ({
    bulgular: [{ tur, kanit, deger: '' }],
    ozet: ozetUret(b, g, acildi),
  });
  const html = g.html ?? '';

  // 1. Bağlantı hatası: sayfa yok (acildi=false), karsilastir önceki değerleri korur.
  // elle_bak sayacı değiştirmez; acilmiyor artırır.
  if (g.hata) {
    if (g.hata.startsWith('butika_yonlendirme')) {
      return tek('elle_bak', `Butika adresine yönleniyor: ${g.hata}`, false);
    }
    if (/time-?out|timed out|ETIMEDOUT|ESOCKETTIMEDOUT|abort/i.test(g.hata)) {
      return tek('elle_bak', `Zaman aşımı: ${g.hata}`, false);
    }
    // Eksik ara sertifika zinciri tarayıcıda çoğu zaman çalışır: elle bak
    if (
      /unable to (?:verify|get)|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|local issuer/i.test(g.hata)
    ) {
      return tek('elle_bak', `Sertifika zinciri doğrulanamadı: ${g.hata}`, false);
    }
    if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|CERT|SSL/i.test(g.hata)) {
      return tek('acilmiyor', g.hata, false);
    }
    return tek('elle_bak', `Bağlantı hatası: ${g.hata}`, false);
  }

  // 2. Bot koruması (Cloudflare vb.): kapalı sayılmaz
  if ((g.status === 403 || g.status === 503) && KORUMA_IZLERI.test(html)) {
    return tek('elle_bak', `Bot koruması (HTTP ${g.status})`, true);
  }

  const baslik = baslikBul(html);
  const h1 = etiketMetni(html, 'h1');
  const urunVar = URUN_IZLERI.test(html);
  let sonYol = '';
  try {
    sonYol = g.sonUrl ? new URL(g.sonUrl).pathname : '';
  } catch {}

  // 3. Park / satılık
  if (/^\/lander\b/i.test(sonYol) || PARK_IZLERI.test(html) || (DAN_COM.test(html) && !urunVar)) {
    return tek('park_satilik', 'Alan adı park edilmiş ya da satılık', false);
  }

  // 4. Bakım sayfası (yalnız kendi sayfası işaretliyse) içerik + fiyat gösteriyorsa
  // bu sayfanın kapalı/açılmıyor bulgusu üretilmez; diğer kontroller çalışır.
  const bakimIsareti =
    /Bakim\.aspx|maintenance/i.test(g.sonUrl ?? '') ||
    /bakim|maintenance/.test(asciiBoslukLu(`${baslik ?? ''} ${h1 ?? ''}`));
  const fiyatVar = /\d[\d.,]*\s?(?:TL|₺)(?![A-Za-z])|₺\s?\d/.test(gorunurMetin(html));
  const bakimAmaIcerikli = bakimIsareti && /sepete ekle|add to cart/i.test(html) && fiyatVar;

  // 5. Mağaza kapalı
  const sifreli = /^\/password\b/i.test(sonYol) || /Enter store using password/i.test(html);
  const kapaliIzi = KAPALI_IZLERI.exec(html);
  const yapimda =
    /Yapım aşamasında/i.test(`${baslik ?? ''} ${h1 ?? ''}`) ||
    (/Yapım aşamasında/i.test(html) && (!urunVar || html.length < 30_000));
  if (!bakimAmaIcerikli && (sifreli || kapaliIzi || yapimda)) {
    return tek(
      'magaza_kapali',
      kapaliIzi ? kapaliIzi[0] : yapimda ? 'Yapım aşamasında' : 'Şifre sayfası',
      false,
    );
  }

  // 6. Erişim engeli (bot koruması izi olmasa da): kapalı sayılmaz
  if (g.status !== null && KORUMA_DURUMLARI.has(g.status)) {
    return tek('elle_bak', `Erişim engeli (HTTP ${g.status})`, true);
  }

  // 7. Hata kodu ya da boş sayfa
  if (!bakimAmaIcerikli) {
    if (g.status !== null && (g.status === 404 || g.status === 410 || g.status >= 500)) {
      return tek('acilmiyor', `HTTP ${g.status}`, false);
    }
    if (html.trim().length === 0) return tek('acilmiyor', 'Boş sayfa', false);
  }

  // 8. İçerik kontrolleri
  const bulgular: HamBulgu[] = [];
  const ozet = ozetUret(b, g, true);

  const ilkKok = kokAlanAdi(b.url);
  const yeniKok = ozet.kokAlanAdi;
  // Aynı marka, başka uzantı (organicera.com → organicera.eu): bölge sitesi, sorun değil
  if (yeniKok && ilkKok && yeniKok !== ilkKok && etiket(yeniKok) !== etiket(ilkKok)) {
    if (BOLGESEL_UZANTILAR.has(uzanti(yeniKok)) && uzanti(yeniKok) !== uzanti(ilkKok)) {
      // Konuma göre yönlenme olabilir; gelen sayfa Türkiye sayfası değil, içerik bakılmaz
      return {
        bulgular: [
          {
            tur: 'elle_bak',
            kanit: `${ilkKok} adresi ${yeniKok} adresine yönleniyor (${SUNUCU_NOTU})`,
            deger: yeniKok,
          },
        ],
        ozet,
      };
    }
    bulgular.push({
      tur: 'baska_alan_adi',
      kanit: `${ilkKok} adresi ${yeniKok} adresine yönleniyor`,
      deger: yeniKok,
    });
  }

  if (ozet.paraBirimi) {
    const beklenen = b.ulke === 'TR' ? 'TRY' : b.ulke === 'US' ? 'USD' : null;
    if (beklenen && ozet.paraBirimi !== beklenen) {
      // Shopify'da pazarın ülkesi bildirildi, güvenilir; diğer altyapılar konuma
      // göre para birimi değiştirebiliyor (Ticimax vb.): elle bakılır
      bulgular.push(
        g.shopifyParaBirimi
          ? {
              tur: 'para_birimi',
              kanit: `${b.ulke} pazarında ${ozet.paraBirimi} görünüyor (beklenen ${beklenen})`,
              deger: ozet.paraBirimi,
            }
          : {
              tur: 'elle_bak',
              kanit: `Sitede ${ozet.paraBirimi} fiyat görünüyor, beklenen ${beklenen} (${SUNUCU_NOTU})`,
              deger: ozet.paraBirimi,
            },
      );
    }
  }

  const siteAdi = metaIcerik(html, 'og:site_name', 'property');
  const adKelimeleri = asciiBoslukLu(b.ad)
    .split(' ')
    .filter((k) => k.length >= 4 && !GENEL_KELIMELER.has(k));
  if (adKelimeleri.length > 0) {
    const kokEtiketi = ozet.kokAlanAdi ? (ozet.kokAlanAdi.split('.')[0] ?? '') : '';
    const samanlik = [baslik, siteAdi, kokEtiketi, gorunurMetin(html).slice(0, 20_000)]
      .map((x) => (x ? sade(x) : ''))
      .join(' ');
    if (!adKelimeleri.some((k) => samanlik.includes(k))) {
      const gorunen = siteAdi ?? baslik ?? '';
      bulgular.push({
        tur: 'marka_uyusmuyor',
        kanit: `"${b.ad}" adı sitede geçmiyor; sitede: "${gorunen}"`,
        deger: gorunen,
      });
    }
  }

  const aciklama = metaIcerik(html, 'description', 'name') ?? '';
  const modaDisi = modaDisiKelime(`${baslik ?? ''} ${aciklama}`);
  if (modaDisi) {
    bulgular.push({
      tur: 'moda_disi',
      kanit: `Başlıkta moda dışı içerik: "${modaDisi}"`,
      deger: modaDisi,
    });
  }

  return { bulgular, ozet };
}
