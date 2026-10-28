import type { NormalUrun } from '../ikas/ikas-urun';
import type { Shopify } from './shopify-istemci';

export const SAYFA_BOYUTU = 50;

type HamVaryant = {
  id: string;
  price: string;
  compareAtPrice?: string | null;
  availableForSale?: boolean | null;
  selectedOptions?: { name: string; value: string }[] | null;
};
type HamUrun = {
  id: string;
  title: string;
  descriptionHtml?: string | null;
  productType?: string | null;
  handle: string;
  publishedAt?: string | null;
  onlineStoreUrl?: string | null;
  isGiftCard?: boolean | null;
  images?: { nodes?: { url: string }[] } | null;
  variants?: { nodes?: HamVaryant[] } | null;
};
type UrunSayfasi = {
  shop: { primaryDomain: { url: string }; currencyCode: string };
  products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: HamUrun[] };
};

// Müşteri, adres, IP ve stok adedi (read_inventory) bilerek HİÇ istenmez.
export const URUN_SORGUSU = `query ($first: Int!, $after: String) {
  shop { primaryDomain { url } currencyCode }
  products(first: $first, after: $after, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title descriptionHtml productType handle publishedAt onlineStoreUrl isGiftCard
      images(first: 10) { nodes { url } }
      variants(first: 100) {
        nodes { id title price compareAtPrice availableForSale selectedOptions { name value } }
      }
    }
  }
}`;

export const POLITIKA_SORGUSU = `query { shop { shopPolicies { type body } } }`;

const minor = (v: string) => Math.round(Number(v) * 100);

function metneCevir(html: string | null | undefined): string | null {
  if (!html) return null;
  const m = html
    .replace(/<br\s*\/?>|<\/(p|h\d|li|div)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return m || null;
}

const sayisalKimlik = (gid: string) => gid.split('/').pop() ?? gid;

export async function* shopifyUrunleriniGetir(ist: Shopify): AsyncGenerator<NormalUrun> {
  let after: string | null = null;
  for (;;) {
    const d: UrunSayfasi = await ist.sorgu<UrunSayfasi>(URUN_SORGUSU, { first: SAYFA_BOYUTU, after });
    const alanAdresi = d.shop.primaryDomain.url.replace(/\/+$/, '');
    for (const u of d.products.nodes) {
      if (!u.publishedAt) continue;
      if (u.isGiftCard || u.productType?.toLowerCase() === 'giftcard') continue;
      const varyantlar = u.variants?.nodes ?? [];
      const taban = u.onlineStoreUrl ?? `${alanAdresi}/products/${u.handle}`;
      const gorseller = (u.images?.nodes ?? []).map((g) => g.url);
      const aciklama = metneCevir(u.descriptionHtml);
      for (const v of varyantlar) {
        const fiyat = minor(v.price);
        const eski = v.compareAtPrice != null ? minor(v.compareAtPrice) : null;
        const indirimli = eski !== null && eski > fiyat;
        const secenekler: Record<string, string> = {};
        for (const o of v.selectedOptions ?? []) {
          if (o.name === 'Title' && o.value === 'Default Title') continue;
          secenekler[o.name] = o.value;
        }
        yield {
          disUrunId: u.id,
          disVaryantId: v.id,
          ad: u.title,
          aciklama,
          url: varyantlar.length > 1 ? `${taban}${taban.includes('?') ? '&' : '?'}variant=${sayisalKimlik(v.id)}` : taban,
          gorseller,
          fiyatMinor: indirimli ? eski : fiyat,
          indirimliFiyatMinor: indirimli ? fiyat : null,
          currency: d.shop.currencyCode,
          stokta: v.availableForSale === true,
          // read_inventory istenmez: adet bilinmez.
          stokAdedi: null,
          secenekler,
          kategori: u.productType || null,
        };
      }
    }
    if (!d.products.pageInfo.hasNextPage || !d.products.pageInfo.endCursor) return;
    after = d.products.pageInfo.endCursor;
  }
}

/** İade politikası gövdesi; etiketsiz, boşlukları sadeleşmiş, en çok 600 karakter. Yoksa null. */
export async function shopifyIadePolitikasiGetir(ist: Shopify): Promise<string | null> {
  const d = await ist.sorgu<{ shop: { shopPolicies?: { type: string; body?: string | null }[] | null } }>(
    POLITIKA_SORGUSU,
  );
  const p = d.shop.shopPolicies?.find((x) => x.type === 'REFUND_POLICY');
  const metin = metneCevir(p?.body);
  return metin ? metin.slice(0, 600).trim() : null;
}
