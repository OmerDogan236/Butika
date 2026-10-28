// Kargo firması kayıt defteri. Öneri listesi (pazara göre) + takip linki.
// trackUrl varsa firmanın kendi takip sayfası; yoksa evrensel takip (17track —
// numaradan firmayı otomatik tespit eder, dünya çapında çoğu kargoyu destekler).
export interface Carrier {
  name: string;
  countries: string[]; // öneri sıralaması için (pazar kodu); 'global' = her yerde
  trackUrl?: (no: string) => string;
}

// Evrensel takip — bilinmeyen/elle yazılan firma veya trackUrl'i olmayanlar için.
export function universalTrackUrl(no: string): string {
  return `https://t.17track.net/en#nums=${encodeURIComponent(no)}`;
}

export const CARRIERS: Carrier[] = [
  // Türkiye
  { name: 'Yurtiçi Kargo', countries: ['TR'] },
  { name: 'Aras Kargo', countries: ['TR'] },
  { name: 'MNG Kargo', countries: ['TR'] },
  {
    name: 'PTT Kargo',
    countries: ['TR'],
    trackUrl: (n) => `https://gonderitakip.ptt.gov.tr/Track/Verify?q=${encodeURIComponent(n)}`,
  },
  { name: 'Sürat Kargo', countries: ['TR'] },
  { name: 'Sendeo', countries: ['TR'] },
  { name: 'HepsiJET', countries: ['TR'] },
  { name: 'Trendyol Express', countries: ['TR'] },
  { name: 'Kolay Gelsin', countries: ['TR'] },
  // Global / çok ülke
  {
    name: 'UPS',
    countries: ['global', 'US', 'TR', 'GB', 'DE'],
    trackUrl: (n) => `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(n)}`,
  },
  {
    name: 'FedEx',
    countries: ['global', 'US'],
    trackUrl: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  },
  {
    name: 'DHL',
    countries: ['global', 'DE', 'TR', 'US'],
    trackUrl: (n) =>
      `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(n)}`,
  },
  { name: 'GLS', countries: ['DE', 'global'] },
  { name: 'TNT', countries: ['global'] },
  // ABD
  {
    name: 'USPS',
    countries: ['US'],
    trackUrl: (n) =>
      `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  },
  { name: 'Amazon', countries: ['US'] },
  // Birleşik Krallık
  {
    name: 'Royal Mail',
    countries: ['GB'],
    trackUrl: (n) =>
      `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(n)}`,
  },
  {
    name: 'Evri',
    countries: ['GB'],
    trackUrl: (n) => `https://www.evri.com/track/parcel/${encodeURIComponent(n)}`,
  },
  { name: 'DPD', countries: ['GB', 'DE'] },
  { name: 'Yodel', countries: ['GB'] },
  // Almanya
  { name: 'Hermes', countries: ['DE'] },
];

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function findCarrier(name: string): Carrier | undefined {
  const n = norm(name);
  return CARRIERS.find((c) => norm(c.name) === n);
}

// Takip URL'i: bilinen firmanın kendi sayfası varsa onu, yoksa evrensel takip.
export function buildTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string,
): string {
  const no = trackingNumber.replace(/\s+/g, '');
  const c = carrier ? findCarrier(carrier) : undefined;
  return c?.trackUrl ? c.trackUrl(no) : universalTrackUrl(no);
}

// Combobox önerileri: query'ye uyanlar, pazar firmaları önce. Boş query → pazar + global.
export function suggestCarriers(query: string, market: string | null, limit = 8): Carrier[] {
  const q = norm(query);
  const rank = (c: Carrier) => {
    if (market && c.countries.includes(market)) return 0;
    if (c.countries.includes('global')) return 1;
    return 2;
  };
  return CARRIERS.filter((c) => !q || norm(c.name).includes(q))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * "Kargom nerede" adresi: butiğin verdiği takip adresi (http/https) varsa o, yoksa firma ve
 * takip numarasından buildTrackingUrl. İkisi de yoksa null (düğme gösterilmez).
 */
export function kargoTakipAdresi(
  takipUrl: string | null | undefined,
  kargoFirmasi: string | null | undefined,
  takipNo: string | null | undefined,
): string | null {
  const adres = takipUrl?.trim();
  if (adres && /^https?:\/\//i.test(adres)) return adres;
  const no = takipNo?.trim();
  return no ? buildTrackingUrl(kargoFirmasi, no) : null;
}
