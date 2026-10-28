import type { NormalSiparis } from '../ikas/ikas-siparis';
import type { Shopify } from './shopify-istemci';

export const SIPARIS_SAYFA_BOYUTU = 50;
const UCRET_PENCERESI_MS = 3 * 24 * 3600_000;

type Para = { shopMoney: { amount: string } };
type Ziyaret = {
  landingPage?: string | null;
  utmParameters?: { source?: string | null; content?: string | null } | null;
} | null;
export type HamShopifySiparis = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string | null;
  cancelledAt?: string | null;
  displayFinancialStatus?: string | null;
  currencyCode: string;
  taxesIncluded?: boolean | null;
  totalTaxSet?: Para | null;
  customerJourneySummary?: { ready?: boolean | null; firstVisit?: Ziyaret; lastVisit?: Ziyaret } | null;
  lineItems?: {
    nodes?: {
      title?: string | null;
      quantity: number;
      product?: { id?: string | null } | null;
      discountedUnitPriceAfterAllDiscountsSet: Para;
    }[];
  } | null;
  fulfillments?:
    | {
        status?: string | null;
        displayStatus?: string | null;
        trackingInfo?: { company?: string | null; number?: string | null; url?: string | null }[] | null;
      }[]
    | null;
};

// Müşteri, e-posta, telefon, adres ve IP alanları bilerek HİÇ istenmez.
export const SIPARIS_ALANLARI = `
  id name createdAt updatedAt cancelledAt displayFinancialStatus currencyCode taxesIncluded
  totalTaxSet { shopMoney { amount } }
  customerJourneySummary {
    ready
    firstVisit { landingPage utmParameters { source content } }
    lastVisit { landingPage utmParameters { source content } }
  }
  lineItems(first: 100) {
    nodes {
      title quantity
      product { id }
      discountedUnitPriceAfterAllDiscountsSet { shopMoney { amount } }
    }
  }
  fulfillments { status displayStatus trackingInfo { company number url } }`;

export const SIPARIS_SORGUSU = `query ($id: ID!) { order(id: $id) {${SIPARIS_ALANLARI} } }`;
export const SIPARIS_LISTE_SORGUSU = `query ($first: Int!, $after: String, $q: String!) {
  orders(first: $first, after: $after, query: $q, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {${SIPARIS_ALANLARI} }
  }
}`;

const minor = (v: string | null | undefined) => Math.round(Number(v ?? 0) * 100);

const ODEME: Record<string, string> = {
  PAID: 'PAID',
  PARTIALLY_REFUNDED: 'PAID',
  REFUNDED: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
};

const KARGOLAR: [string, string][] = [
  ['yurticikargo', 'Yurtiçi Kargo'],
  ['araskargo', 'Aras Kargo'],
  ['mngkargo', 'MNG Kargo'],
  ['ptt.gov', 'PTT Kargo'],
  ['suratkargo', 'Sürat Kargo'],
  ['hepsijet', 'HepsiJet'],
  ['trendyolexpress', 'Trendyol Express'],
];

function kargoAdi(company: string | null | undefined, url: string | null | undefined): string | null {
  if (company && company !== 'Other') return company;
  if (!url) return null;
  let sunucu: string;
  try {
    sunucu = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return KARGOLAR.find(([parca]) => sunucu.includes(parca))?.[1] ?? null;
}

function atif(h: HamShopifySiparis): { utmSource: string | null; utmContent: string | null } {
  const j = h.customerJourneySummary;
  for (const z of [j?.lastVisit, j?.firstVisit]) {
    if (!z) continue;
    let source = z.utmParameters?.source ?? null;
    let content = z.utmParameters?.content ?? null;
    if (!source && z.landingPage) {
      // UTM alanı yoksa açılış sayfası adresinin sorgu dizgesine bakılır.
      const q = new URLSearchParams(z.landingPage.split('?')[1] ?? '');
      source = q.get('utm_source');
      content = q.get('utm_content');
    }
    if (source === 'butika') return { utmSource: 'butika', utmContent: content };
  }
  return { utmSource: null, utmContent: null };
}

/** Beyaz liste: yalnız NormalSiparis alanları kopyalanır, ham nesne dışarı çıkmaz. `ready` değilse null. */
export function siparisAyristir(h: HamShopifySiparis): NormalSiparis | null {
  if (h.customerJourneySummary?.ready !== true) return null;
  const satirlar = h.lineItems?.nodes ?? [];
  // Orijinal adet × indirimli birim fiyat: iade sonrası küçülen current* alanları kullanılmaz.
  const satirToplami = satirlar.reduce(
    (t, s) => t + minor(s.discountedUnitPriceAfterAllDiscountsSet.shopMoney.amount) * s.quantity,
    0,
  );
  const vergi = h.taxesIncluded ? minor(h.totalTaxSet?.shopMoney.amount) : 0;

  const gonderiler = (h.fulfillments ?? []).filter((f) => f.status !== 'CANCELLED');
  const paket = h.cancelledAt
    ? 'CANCELLED'
    : gonderiler.length === 0
      ? null
      : gonderiler.every((f) => f.displayStatus === 'DELIVERED')
        ? 'DELIVERED'
        : 'FULFILLED';
  const finans = h.displayFinancialStatus ?? '';
  const status = h.cancelledAt
    ? 'CANCELLED'
    : finans === 'REFUNDED' || finans === 'PARTIALLY_REFUNDED'
      ? finans
      : 'CREATED';
  const takip = gonderiler
    .flatMap((f) => f.trackingInfo ?? [])
    .find((t) => t.number || t.url);

  return {
    disSiparisId: h.id,
    siparisNo: h.name,
    // processedAt mağaza tarafından değiştirilebilir (sipariş içe aktarma); komisyon ayını
    // belirlediği için Shopify'ın kendi yazdığı createdAt kullanılır.
    siparisAt: new Date(h.createdAt),
    guncellemeAt: h.updatedAt ? new Date(h.updatedAt) : null,
    ...atif(h),
    hamDurum: { status, odeme: ODEME[finans] ?? finans, paket },
    tutarMinor: Math.max(0, satirToplami - vergi),
    currency: h.currencyCode,
    satirlar: satirlar.map((s) => ({
      ad: s.title ?? '',
      adet: s.quantity,
      birimFiyatMinor: minor(s.discountedUnitPriceAfterAllDiscountsSet.shopMoney.amount),
      disUrunId: s.product?.id ?? '',
    })),
    kargoFirmasi: takip ? kargoAdi(takip.company, takip.url) : null,
    takipNo: takip?.number ?? null,
    takipUrl: takip?.url ?? null,
  };
}

type ListeSayfasi = {
  orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: HamShopifySiparis[] };
};

async function* tara(ist: Shopify, q: string): AsyncGenerator<HamShopifySiparis> {
  let after: string | null = null;
  for (;;) {
    const d: ListeSayfasi = await ist.sorgu<ListeSayfasi>(SIPARIS_LISTE_SORGUSU, {
      first: SIPARIS_SAYFA_BOYUTU,
      after,
      q,
    });
    yield* d.orders.nodes;
    if (!d.orders.pageInfo.hasNextPage || !d.orders.pageInfo.endCursor) return;
    after = d.orders.pageInfo.endCursor;
  }
}

/**
 * `sonra` tarihinden beri güncellenenler + son 3 günde açılanlar (atıf bilgisi geç hazır olabilir;
 * `updatedAt` değişmese de yakalansın). Kimliğe göre tekilleştirilir.
 */
export async function* shopifySiparisleriniGetir(
  ist: Shopify,
  sonra: Date,
  simdi: Date,
): AsyncGenerator<NormalSiparis> {
  const goruldu = new Set<string>();
  const sorgular = [
    `updated_at:>='${sonra.toISOString()}'`,
    `created_at:>='${new Date(simdi.getTime() - UCRET_PENCERESI_MS).toISOString()}'`,
  ];
  for (const q of sorgular) {
    for await (const h of tara(ist, q)) {
      if (goruldu.has(h.id)) continue;
      goruldu.add(h.id);
      const s = siparisAyristir(h);
      if (s) yield s;
    }
  }
}

export async function shopifySiparisGetir(ist: Shopify, disSiparisId: string): Promise<NormalSiparis | null> {
  const id = disSiparisId.startsWith('gid://') ? disSiparisId : `gid://shopify/Order/${disSiparisId}`;
  const d = await ist.sorgu<{ order: HamShopifySiparis | null }>(SIPARIS_SORGUSU, { id });
  return d.order ? siparisAyristir(d.order) : null;
}
