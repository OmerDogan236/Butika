// Paylaşım menüsünden gelen bir ürün sayfasının adı, görseli ve fiyatı ("Paylaş… → Butika").
// Uygulama içi tarayıcıda bu bilgiler sayfadan alınır; paylaşımda sunucu sayfayı bir kez okur.
// Önce sayfanın kendi ürün bilgisi (JSON-LD Product), yoksa og:/product: meta etiketleri.

import { TARAYICI_BASLIKLARI } from './butik-dogrula';
import { logger } from './logger';
import { retailerFetch } from './price-tracking/retailer-http';

export interface UrunBilgisi {
  title: string;
  imageUrl: string | null;
  priceMinor: number | null;
  currency: string | null;
}

function meta(html: string, ad: string): string | null {
  const k = ad.replace(/[.:]/g, '\\$&');
  const m = new RegExp(
    `<meta[^>]{1,500}?(?:property|name|itemprop)=["']${k}["'][^>]{0,500}?content=["']([^"']{1,2000})["']|<meta[^>]{1,500}?content=["']([^"']{1,2000})["'][^>]{0,500}?(?:property|name|itemprop)=["']${k}["']`,
    'i',
  ).exec(html);
  const d = (m?.[1] ?? m?.[2] ?? '').trim();
  return d ? cozHtml(d) : null;
}

function cozHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/** "1.299,90" / "1299.90" / "1,299.90" → kuruş. Anlaşılmazsa null. */
export function fiyatKurus(deger: unknown): number | null {
  if (typeof deger === 'number') return Number.isFinite(deger) && deger >= 0 ? Math.round(deger * 100) : null;
  if (typeof deger !== 'string') return null;
  let s = deger.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const sonVirgul = s.lastIndexOf(',');
  const sonNokta = s.lastIndexOf('.');
  if (sonVirgul >= 0 && sonNokta >= 0) {
    // İkisi de varsa sondaki ondalıktır: "1.299,90" / "1,299.90"
    s = sonVirgul > sonNokta ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    // Tek tür ayraç ve hep üçlü gruplar: binlik ayracı ("4.250", "12,500")
    s = s.replace(/[.,]/g, '');
  } else {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

type JsonLd = Record<string, unknown>;

function urunJsonLd(html: string): JsonLd | null {
  const bloklar = html.matchAll(/<script[^>]{0,300}?type=["']application\/ld\+json["'][^>]{0,300}>([\s\S]{0,100000}?)<\/script>/gi);
  for (const [, ham] of bloklar) {
    let veri: unknown;
    try {
      veri = JSON.parse((ham ?? '').trim());
    } catch {
      continue;
    }
    const adaylar: unknown[] = Array.isArray(veri) ? veri : [veri];
    for (const a of [...adaylar]) {
      if (a && typeof a === 'object' && Array.isArray((a as JsonLd)['@graph'])) adaylar.push(...((a as JsonLd)['@graph'] as unknown[]));
    }
    for (const a of adaylar) {
      if (!a || typeof a !== 'object') continue;
      const tur = (a as JsonLd)['@type'];
      if (tur === 'Product' || (Array.isArray(tur) && tur.includes('Product'))) return a as JsonLd;
    }
  }
  return null;
}

function ilkGorsel(deger: unknown): string | null {
  if (typeof deger === 'string') return deger;
  if (Array.isArray(deger)) return ilkGorsel(deger[0]);
  if (deger && typeof deger === 'object') return ilkGorsel((deger as JsonLd).url ?? (deger as JsonLd).contentUrl);
  return null;
}

function mutlakHttps(adres: string | null, taban: string): string | null {
  if (!adres) return null;
  try {
    const u = new URL(adres.replace(/^\/\//, 'https://'), taban);
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

// Ürün bilgisi sayfanın başında (head + ilk JSON-LD) olur; daha fazlası yalnız düzenli ifadelerin
// süresini uzatır. Çok büyük/kötü niyetli sayfada işlem süresi bu sınırla kısıtlı kalır.
const EN_COK_KARAKTER = 400_000;

/** Saf işlev: HTML'den ürün bilgisi. Ad bulunamazsa null. */
export function urunBilgisi(tamHtml: string, adres: string): UrunBilgisi | null {
  const html = tamHtml.slice(0, EN_COK_KARAKTER);
  const ld = urunJsonLd(html);
  const teklifHam = ld?.offers;
  const teklif = (Array.isArray(teklifHam) ? teklifHam[0] : teklifHam) as JsonLd | undefined;
  const ldFiyat = teklif ? (teklif.price ?? teklif.lowPrice ?? (teklif.priceSpecification as JsonLd | undefined)?.price) : undefined;
  const ldPara = teklif ? (teklif.priceCurrency ?? (teklif.priceSpecification as JsonLd | undefined)?.priceCurrency) : undefined;

  const baslik =
    (typeof ld?.name === 'string' ? cozHtml(ld.name) : null) ??
    meta(html, 'og:title') ??
    (/<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)?.[1] ? cozHtml(/<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)![1]!) : null);
  if (!baslik?.trim()) return null;

  // JSON-LD fiyatı standart biçimde ("1500.00", "1.5"): nokta her zaman ondalıktır.
  const ldKurus =
    typeof ldFiyat === 'string' && /^\d+(\.\d+)?$/.test(ldFiyat.trim())
      ? Math.round(Number(ldFiyat) * 100)
      : fiyatKurus(ldFiyat);
  const priceMinor =
    ldKurus ?? fiyatKurus(meta(html, 'product:price:amount') ?? meta(html, 'og:price:amount'));
  const paraHam = (typeof ldPara === 'string' ? ldPara : null) ?? meta(html, 'product:price:currency') ?? meta(html, 'og:price:currency');
  const currency = paraHam && /^[A-Z]{3}$/.test(paraHam.trim().toUpperCase()) ? paraHam.trim().toUpperCase() : null;

  return {
    title: baslik.replace(/\s+/g, ' ').trim().slice(0, 300),
    imageUrl: mutlakHttps(ilkGorsel(ld?.image) ?? meta(html, 'og:image:secure_url') ?? meta(html, 'og:image'), adres),
    priceMinor: priceMinor && priceMinor > 0 ? priceMinor : null,
    currency: priceMinor ? currency : null,
  };
}

/** Ürün sayfasını güvenli okuyucuyla açar (yalnız herkese açık adresler, Shopify'a aralıklı). */
export async function urunSayfasiOku(
  adres: string,
  deps: { fetch?: typeof retailerFetch } = {},
): Promise<UrunBilgisi | null> {
  try {
    const yanit = await (deps.fetch ?? retailerFetch)(adres, {
      headers: TARAYICI_BASLIKLARI,
      signal: AbortSignal.timeout(12_000),
    });
    if (!yanit.ok) return null;
    return urunBilgisi((await yanit.text()).slice(0, EN_COK_KARAKTER), adres);
  } catch (err) {
    logger.warn({ err, adres }, 'paylaşım: ürün sayfası okunamadı');
    return null;
  }
}
