import type { Ikas } from './ikas-istemci';

export const SAYFA_BOYUTU = 50;

export type NormalUrun = {
  disUrunId: string;
  disVaryantId: string | null;
  ad: string;
  aciklama: string | null;
  url: string;
  gorseller: string[];
  fiyatMinor: number;
  indirimliFiyatMinor: number | null;
  currency: string;
  stokta: boolean;
  stokAdedi: number | null;
  secenekler: Record<string, string>;
  kategori: string | null;
};

type HamVaryant = {
  id: string;
  isActive?: boolean | null;
  sellIfOutOfStock?: boolean | null;
  images?: { imageId: string; isMain?: boolean | null; order?: number | null }[] | null;
  prices?: { sellPrice?: number | null; discountPrice?: number | null; currency?: string | null }[] | null;
  stocks?: { stockCount?: number | null }[] | null;
};
type HamUrun = {
  id: string;
  name: string;
  description?: string | null;
  deleted?: boolean | null;
  metaData?: { slug?: string | null } | null;
  categories?: { name?: string | null }[] | null;
  variants?: HamVaryant[] | null;
};

const URUN_SORGUSU = `query ($limit: Int!, $page: Int!) {
  listProduct(pagination: { limit: $limit, page: $page }) {
    data {
      id name description deleted
      metaData { slug }
      categories { name }
      variants {
        id isActive sellIfOutOfStock
        images { imageId isMain order }
        prices { sellPrice discountPrice currency }
        stocks { stockCount }
      }
    }
  }
}`;

const ALAN_ADI = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

const minor = (v: number) => Math.round(v * 100);

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

export async function* ikasUrunleriniGetir(ist: Ikas): AsyncGenerator<NormalUrun> {
  // Mağaza kimliği ve alan adı bir kez alınır.
  const kimlik = await ist.sorgu<{ getMerchant: { id: string; storeName: string } }>(
    `query { getMerchant { id storeName } }`,
  );
  const vitrin = await ist.sorgu<{ listStorefront: { routings?: { domain: string | null }[] | null }[] }>(
    `query { listStorefront { routings { domain } } }`,
  );
  const merchantId = kimlik.getMerchant.id;
  const varsayilanAlan = `${kimlik.getMerchant.storeName}.ikas.shop`;
  const aday = vitrin.listStorefront?.[0]?.routings?.find((r) => r.domain)?.domain;
  // Alan adı dış kaynaklı: geçerli bir ana makine adı değilse mağaza adresine dön.
  const alanAdi = aday && ALAN_ADI.test(aday) ? aday : varsayilanAlan;

  for (let sayfa = 1; ; sayfa++) {
    const d = await ist.sorgu<{ listProduct: { data: HamUrun[] } }>(URUN_SORGUSU, {
      limit: SAYFA_BOYUTU,
      page: sayfa,
    });
    const urunler = d.listProduct?.data ?? [];
    for (const u of urunler) {
      if (u.deleted) continue;
      const slug = u.metaData?.slug;
      for (const v of u.variants ?? []) {
        if (v.isActive === false) continue;
        const fiyat = v.prices?.[0];
        if (fiyat?.sellPrice == null) continue;
        const stokAdedi = (v.stocks ?? []).reduce((t, s) => t + Math.max(0, s.stockCount ?? 0), 0);
        const gorseller = [...(v.images ?? [])]
          .sort((a, b) => Number(!!b.isMain) - Number(!!a.isMain) || (a.order ?? 0) - (b.order ?? 0))
          .map((g) => `https://cdn.myikas.com/images/${merchantId}/${g.imageId}/image_1080.webp`);
        yield {
          disUrunId: u.id,
          disVaryantId: v.id,
          ad: u.name,
          aciklama: metneCevir(u.description),
          url: slug ? `https://${alanAdi}/${slug}` : `https://${alanAdi}`,
          gorseller,
          fiyatMinor: minor(fiyat.sellPrice),
          indirimliFiyatMinor: fiyat.discountPrice != null ? minor(fiyat.discountPrice) : null,
          // ikas örnek verisinde para birimi boş gelebiliyor; Türkiye mağazası varsayımı.
          currency: fiyat.currency ?? 'TRY',
          stokta: stokAdedi > 0 || !!v.sellIfOutOfStock,
          stokAdedi,
          // Seçenek adları için ek sorgu gerekir; şimdilik boş (yalnız variantValueIds var).
          secenekler: {},
          kategori: u.categories?.[0]?.name ?? null,
        };
      }
    }
    if (urunler.length < SAYFA_BOYUTU) return;
  }
}

/** ikas API'si iade politikası metnini vermiyor (bkz. docs/superpowers/notes/2026-10-ikas-spike.md). */
export async function ikasIadePolitikasiGetir(_ist: Ikas): Promise<string | null> {
  return null;
}
