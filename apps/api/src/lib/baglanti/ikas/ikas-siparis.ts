import type { Ikas } from './ikas-istemci';

export const SIPARIS_SAYFA_BOYUTU = 50;

export type NormalSiparis = {
  disSiparisId: string;
  siparisNo: string;
  siparisAt: Date;
  /** ikas `updatedAt`; yoksa null. */
  guncellemeAt: Date | null;
  utmSource: string | null;
  utmContent: string | null;
  hamDurum: { status: string; odeme: string; paket: string | null };
  tutarMinor: number;
  currency: string;
  satirlar: { ad: string; adet: number; birimFiyatMinor: number; disUrunId: string }[];
  kargoFirmasi: string | null;
  takipNo: string | null;
  takipUrl: string | null;
};

// Müşteri, adres, IP gibi alanlar bilerek HİÇ istenmez.
const SIPARIS_ALANLARI = `
  id orderNumber status orderPaymentStatus orderPackageStatus orderedAt updatedAt currencyCode
  taxLines { price }
  sessionInfo { utm { source content } }
  orderLineItems { quantity finalPrice variant { productId name } }
  orderPackages { trackingInfo { cargoCompany trackingNumber trackingLink } }`;

export type HamSiparis = {
  id: string;
  orderNumber: string | number;
  status: string;
  orderPaymentStatus?: string | null;
  orderPackageStatus?: string | null;
  orderedAt: number;
  updatedAt?: number | null;
  currencyCode?: string | null;
  taxLines?: { price?: number | null }[] | null;
  sessionInfo?: { utm?: { source?: string | null; content?: string | null } | null } | null;
  orderLineItems?:
    | {
        quantity: number;
        finalPrice: number;
        variant?: { productId?: string | null; name?: string | null } | null;
      }[]
    | null;
  orderPackages?:
    | {
        trackingInfo?: {
          cargoCompany?: string | null;
          trackingNumber?: string | null;
          trackingLink?: string | null;
        } | null;
      }[]
    | null;
};

/** Beyaz liste: yalnız NormalSiparis alanları kopyalanır, ham nesne dışarı çıkmaz. */
export function siparisAyristir(h: HamSiparis): NormalSiparis {
  const satirlar = h.orderLineItems ?? [];
  // finalPrice birim fiyattır (indirim sonrası, KDV dahil); kargo satırlarda olmadığı için zaten dışarıda.
  const satirToplami = satirlar.reduce((t, s) => t + s.finalPrice * s.quantity, 0);
  const vergi = (h.taxLines ?? []).reduce((t, v) => t + (v.price ?? 0), 0);
  const paket = (h.orderPackages ?? []).find(
    (p) => p.trackingInfo?.trackingNumber || p.trackingInfo?.trackingLink,
  );
  return {
    disSiparisId: h.id,
    siparisNo: String(h.orderNumber),
    siparisAt: new Date(h.orderedAt),
    guncellemeAt: typeof h.updatedAt === 'number' ? new Date(h.updatedAt) : null,
    utmSource: h.sessionInfo?.utm?.source ?? null,
    utmContent: h.sessionInfo?.utm?.content ?? null,
    hamDurum: {
      status: h.status,
      odeme: h.orderPaymentStatus ?? '',
      paket: h.orderPackageStatus ?? null,
    },
    tutarMinor: Math.round((satirToplami - vergi) * 100),
    currency: h.currencyCode ?? 'TRY',
    satirlar: satirlar.map((s) => ({
      ad: s.variant?.name ?? '',
      adet: s.quantity,
      birimFiyatMinor: Math.round(s.finalPrice * 100),
      disUrunId: s.variant?.productId ?? '',
    })),
    kargoFirmasi: paket?.trackingInfo?.cargoCompany ?? null,
    takipNo: paket?.trackingInfo?.trackingNumber ?? null,
    takipUrl: paket?.trackingInfo?.trackingLink ?? null,
  };
}

/** `sonra` tarihinden beri güncellenen siparişler (ödeme/kargo değişimi de yakalansın). */
export async function* ikasSiparisleriniGetir(
  ist: Ikas,
  sonra: Date,
): AsyncGenerator<NormalSiparis> {
  for (let sayfa = 1; ; sayfa++) {
    const d = await ist.sorgu<{ listOrder: { data: HamSiparis[] } }>(
      `query ($limit: Int!, $page: Int!, $sonra: Timestamp!) {
        listOrder(pagination: { limit: $limit, page: $page }, updatedAt: { gte: $sonra }) { data {${SIPARIS_ALANLARI} } }
      }`,
      { limit: SIPARIS_SAYFA_BOYUTU, page: sayfa, sonra: sonra.getTime() },
    );
    const siparisler = d.listOrder?.data ?? [];
    for (const s of siparisler) yield siparisAyristir(s);
    if (siparisler.length < SIPARIS_SAYFA_BOYUTU) return;
  }
}

export async function ikasSiparisGetir(
  ist: Ikas,
  disSiparisId: string,
): Promise<NormalSiparis | null> {
  const d = await ist.sorgu<{ listOrder: { data: HamSiparis[] } }>(
    `query ($id: String!) { listOrder(id: { eq: $id }) { data {${SIPARIS_ALANLARI} } } }`,
    { id: disSiparisId },
  );
  const s = d.listOrder?.data?.[0];
  return s ? siparisAyristir(s) : null;
}
