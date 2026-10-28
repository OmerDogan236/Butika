import { retailerFetch } from '../price-tracking/retailer-http';
import {
  type Confidence,
  type EmailType,
  epostaTuru,
  guvenGerekcesi,
  guvenPuani,
  onerilenEposta,
} from './classify-email';
import {
  type AdaySayfa,
  type SayfaTuru,
  iletisimSayfalariniSec,
  tahminiIletisimYollari,
} from './contact-pages';
import { type FoundIn, epostalariCikar } from './extract-emails';

// Bir butigin sitesinden iletisim e-postasi arar.
//
// Tasarim kararlari:
// - Girdi yalnizca URL. Butik kaydini bilmez; ileride Discovery Agent'in buldugu
//   yeni markalar da ayni servise verilebilsin diye.
// - En fazla MAKS_SAYFA sayfa acilir. Site bastan sona taranmaz.
// - Istekler retailerFetch uzerinden gider: origin basina 1 sn aralik, 403/429
//   alinca soguma, SSRF korumasi. Fiyat takibinde kullanilan altyapinin aynisi.
// - ADRES UYDURULMAZ. Sayfada yazmiyorsa sonuc bostur.

const MAKS_SAYFA = 5;
const ZAMAN_ASIMI_MS = 12_000;
const MAKS_HTML_BAYT = 2_000_000;

export type IletisimAdayi = {
  email: string;
  sourceUrl: string;
  sourcePageType: SayfaTuru;
  foundIn: FoundIn;
  emailType: EmailType;
  confidence: Confidence;
  confidenceReason: string | null;
};

export type TaramaSonucu = {
  domain: string;
  adaylar: IletisimAdayi[];
  onerilen: string | null;
  acilanSayfalar: number;
  hata: string | null;
};

export function alanAdiCikar(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

async function sayfaIndir(url: string): Promise<string | null> {
  try {
    const yanit = await retailerFetch(new URL(url), {
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    if (!yanit.ok) {
      await yanit.body?.cancel();
      return null;
    }
    const tur = yanit.headers.get('content-type') ?? '';
    if (tur && !tur.includes('html')) {
      await yanit.body?.cancel();
      return null;
    }
    const metin = await yanit.text();
    return metin.length > MAKS_HTML_BAYT ? metin.slice(0, MAKS_HTML_BAYT) : metin;
  } catch {
    return null;
  }
}

export async function iletisimBilgisiAra(siteUrl: string): Promise<TaramaSonucu> {
  const domain = alanAdiCikar(siteUrl);
  if (!domain) {
    return { domain: '', adaylar: [], onerilen: null, acilanSayfalar: 0, hata: 'gecersiz_adres' };
  }

  const bosSonuc = (hata: string | null, sayfa: number): TaramaSonucu => ({
    domain,
    adaylar: [],
    onerilen: null,
    acilanSayfalar: sayfa,
    hata,
  });

  const anaSayfa = await sayfaIndir(siteUrl);
  if (anaSayfa === null) return bosSonuc('site_acilmadi', 1);

  // Ana sayfa + link'lerden secilen sayfalar. Link bulunamazsa klasik yollari dene.
  const secilen = iletisimSayfalariniSec(anaSayfa, siteUrl, MAKS_SAYFA - 1);
  const sayfalar: AdaySayfa[] =
    secilen.length > 0 ? secilen : tahminiIletisimYollari(siteUrl).slice(0, 2);

  const toplananlar = new Map<string, IletisimAdayi>();

  const isle = (html: string, url: string, pageType: SayfaTuru) => {
    for (const bulunan of epostalariCikar(html)) {
      const confidence = guvenPuani(bulunan, domain, pageType);
      const aday: IletisimAdayi = {
        email: bulunan.email,
        sourceUrl: url,
        sourcePageType: pageType,
        foundIn: bulunan.foundIn,
        emailType: epostaTuru(bulunan.email),
        confidence,
        confidenceReason: guvenGerekcesi(bulunan.email, domain, confidence),
      };
      const mevcut = toplananlar.get(aday.email);
      // Ayni adres birden cok sayfada varsa daha guvenilir kaynagi sakla
      if (!mevcut || (mevcut.confidence !== 'yuksek' && aday.confidence === 'yuksek')) {
        toplananlar.set(aday.email, aday);
      }
    }
  };

  isle(anaSayfa, siteUrl, 'anasayfa');

  let acilan = 1;
  for (const sayfa of sayfalar) {
    if (acilan >= MAKS_SAYFA) break;
    const html = await sayfaIndir(sayfa.url);
    acilan += 1;
    if (html) isle(html, sayfa.url, sayfa.pageType);
  }

  const adaylar = [...toplananlar.values()];
  const onerilen = onerilenEposta(adaylar);

  return {
    domain,
    adaylar,
    onerilen: onerilen?.email ?? null,
    acilanSayfalar: acilan,
    hata: adaylar.length === 0 ? 'eposta_bulunamadi' : null,
  };
}
