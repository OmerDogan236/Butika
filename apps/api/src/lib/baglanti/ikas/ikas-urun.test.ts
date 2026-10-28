import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ikasIstemci } from './ikas-istemci';
import { SAYFA_BOYUTU, ikasIadePolitikasiGetir, ikasUrunleriniGetir } from './ikas-urun';

const fikstur = JSON.parse(readFileSync(new URL('./fixtures/urunler.json', import.meta.url), 'utf8'));
const urunler: any[] = fikstur.data.listProduct.data;

/** Sorgu metnine bakarak cevap veren sahte ikas. */
function sahteIkas(sayfalar: any[][], storefront: unknown = [{ routings: [{ domain: 'magaza.example.com' }] }]) {
  const sayfaIstekleri: number[] = [];
  let kimlikIstegi = 0;
  const fn = (async (_url: string, init: RequestInit) => {
    const { query, variables } = JSON.parse(String(init.body));
    let data: unknown;
    if (query.includes('getMerchant')) {
      kimlikIstegi++;
      data = { getMerchant: { id: 'm1', storeName: 'dev-x' } };
    } else if (query.includes('listStorefront')) {
      data = { listStorefront: storefront };
    } else {
      sayfaIstekleri.push(variables.page);
      data = { listProduct: { count: 0, data: sayfalar[variables.page - 1] ?? [] } };
    }
    return new Response(JSON.stringify({ data }), { status: 200 });
  }) as unknown as typeof fetch;
  const ist = ikasIstemci(
    {
      magazaAdi: 'dev-x',
      tokenlar: { erisim: 'a', yenileme: 'r', bitisAt: new Date(Date.now() + 3 * 3600_000).toISOString() },
    },
    fn,
  );
  return { ist, sayfaIstekleri, kimlikIstegi: () => kimlikIstegi };
}

async function topla<T>(g: AsyncGenerator<T>): Promise<T[]> {
  const s: T[] = [];
  for await (const x of g) s.push(x);
  return s;
}

describe('ikasUrunleriniGetir', () => {
  test('her varyant bir NormalUrun; fiyat, url ve gorsel fiksturle uyumlu', async () => {
    const { ist } = sahteIkas([urunler]);
    const sonuc = await topla(ikasUrunleriniGetir(ist));
    const varyantSayisi = urunler.reduce((t, u) => t + u.variants.filter((v: any) => v.isActive).length, 0);
    expect(sonuc).toHaveLength(varyantSayisi);
    const ilk = sonuc[0]!;
    const u0 = urunler[0];
    const v0 = u0.variants[0];
    expect(ilk.disUrunId).toBe(u0.id);
    expect(ilk.disVaryantId).toBe(v0.id);
    expect(ilk.ad).toBe(u0.name);
    expect(ilk.fiyatMinor).toBe(Math.round(v0.prices[0].sellPrice * 100));
    expect(ilk.indirimliFiyatMinor).toBe(Math.round(v0.prices[0].discountPrice * 100));
    expect(ilk.url).toBe(`https://magaza.example.com/${u0.metaData.slug}`);
    const anaGorsel = [...v0.images].sort((a: any, b: any) => Number(b.isMain) - Number(a.isMain) || a.order - b.order)[0];
    expect(ilk.gorseller[0]).toBe(`https://cdn.myikas.com/images/m1/${anaGorsel.imageId}/image_1080.webp`);
    expect(ilk.aciklama).not.toContain('<');
    expect(ilk.aciklama).toContain('Versatile Design');
    expect(ilk.stokta).toBe(true);
    expect(ilk.kategori).toBeNull();
  });

  test('stogu 0 olan varyant stokta:false; sellIfOutOfStock ise true', async () => {
    const kopya = structuredClone(urunler.slice(0, 1));
    kopya[0].variants[0].stocks = [{ stockCount: 0, stockLocationId: 'l' }];
    kopya[0].variants[0].sellIfOutOfStock = false;
    kopya[0].variants[1].stocks = [{ stockCount: 0, stockLocationId: 'l' }];
    kopya[0].variants[1].sellIfOutOfStock = true;
    const sonuc = await topla(ikasUrunleriniGetir(sahteIkas([kopya]).ist));
    expect(sonuc[0]!.stokta).toBe(false);
    expect(sonuc[0]!.stokAdedi).toBe(0);
    expect(sonuc[1]!.stokta).toBe(true);
  });

  test('alan adi yoksa magaza.ikas.shop kullanilir', async () => {
    const { ist } = sahteIkas([urunler], [{ routings: [{ domain: null }] }]);
    const sonuc = await topla(ikasUrunleriniGetir(ist));
    expect(sonuc[0]!.url).toBe(`https://dev-x.ikas.shop/${urunler[0].metaData.slug}`);
  });

  test('gecersiz alan adi magaza adresine doner; negatif stok 0 sayilir', async () => {
    const kopya = structuredClone(urunler.slice(0, 1));
    kopya[0].variants[0].stocks = [{ stockCount: -5, stockLocationId: 'a' }, { stockCount: 3, stockLocationId: 'b' }];
    const { ist } = sahteIkas([kopya], [{ routings: [{ domain: 'evil.com/x?y' }] }]);
    const sonuc = await topla(ikasUrunleriniGetir(ist));
    expect(sonuc[0]!.url.startsWith('https://dev-x.ikas.shop/')).toBe(true);
    expect(sonuc[0]!.stokAdedi).toBe(3);
  });

  test('sayfa dolu geldikce sonraki sayfa istenir; kimlik bir kez', async () => {
    const dolu = Array.from({ length: SAYFA_BOYUTU }, () => urunler[0]);
    const { ist, sayfaIstekleri, kimlikIstegi } = sahteIkas([dolu, urunler]);
    const sonuc = await topla(ikasUrunleriniGetir(ist));
    expect(sayfaIstekleri).toEqual([1, 2]);
    expect(kimlikIstegi()).toBe(1);
    expect(sonuc.length).toBeGreaterThan(SAYFA_BOYUTU);
  });

  test('silinmis urun ve pasif varyant atlanir', async () => {
    const kopya = structuredClone(urunler.slice(0, 2));
    kopya[0].deleted = true;
    kopya[1].variants[0].isActive = false;
    const sonuc = await topla(ikasUrunleriniGetir(sahteIkas([kopya]).ist));
    expect(sonuc).toHaveLength(kopya[1].variants.length - 1);
  });
});

test('ikasIadePolitikasiGetir her zaman null (API metin vermiyor)', async () => {
  expect(await ikasIadePolitikasiGetir(sahteIkas([]).ist)).toBeNull();
});
