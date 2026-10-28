import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { shopifyIstemci } from './shopify-istemci';
import { URUN_SORGUSU, shopifyIadePolitikasiGetir, shopifyUrunleriniGetir } from './shopify-urun';

const fikstur = (ad: string) => JSON.parse(readFileSync(new URL(`./fixtures/${ad}`, import.meta.url), 'utf8'));

function istemci(yanitlar: unknown[]) {
  const govdeler: { query: string; variables: Record<string, unknown> }[] = [];
  let i = 0;
  const fn = (async (_u: string | URL | Request, init?: RequestInit) => {
    govdeler.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(yanitlar[Math.min(i++, yanitlar.length - 1)]), { status: 200 });
  }) as unknown as typeof fetch;
  const ist = shopifyIstemci(
    { magaza: 'deneme.myshopify.com', uyg: { clientId: 'a', secret: 'b' }, tokenlar: { erisim: 't', yenileme: null, bitisAt: null } },
    fn,
  );
  return { ist, govdeler };
}

async function topla() {
  const sayfa1 = fikstur('urunler.json');
  const sayfa2 = {
    data: { shop: sayfa1.data.shop, products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } },
  };
  const { ist, govdeler } = istemci([sayfa1, sayfa2]);
  const urunler = [];
  for await (const u of shopifyUrunleriniGetir(ist)) urunler.push(u);
  return { urunler, govdeler, sayfa1 };
}

describe('shopifyUrunleriniGetir', () => {
  test('yayinda olmayan ve hediye karti urunler atlanir, varyant basina bir kayit', async () => {
    const { urunler } = await topla();
    const adlar = new Set(urunler.map((u) => u.ad));
    expect(adlar.has('Gift Card')).toBe(false);
    expect(adlar.has('The Minimal Snowboard')).toBe(false); // publishedAt null
    expect(adlar.has('The Hidden Snowboard')).toBe(false);
    expect(urunler).toHaveLength(13);
    expect(new Set(urunler.map((u) => u.disVaryantId)).size).toBe(13);
  });

  test('ikinci sayfa imlecle istenir', async () => {
    const { govdeler, sayfa1 } = await topla();
    expect(govdeler).toHaveLength(2);
    expect(govdeler[0]!.variables.after ?? null).toBeNull();
    expect(govdeler[1]!.variables.after).toBe(sayfa1.data.products.pageInfo.endCursor);
  });

  test('indirimli urun: fiyatMinor = compareAtPrice, indirimliFiyatMinor = price', async () => {
    const { urunler } = await topla();
    const u = urunler.find((x) => x.ad === 'The Compare at Price Snowboard')!;
    expect(u.fiyatMinor).toBe(88595);
    expect(u.indirimliFiyatMinor).toBe(78595);
    expect(u.currency).toBe('USD');
    const normal = urunler.find((x) => x.ad === 'The Videographer Snowboard')!;
    expect(normal.fiyatMinor).toBe(88595);
    expect(normal.indirimliFiyatMinor).toBeNull();
  });

  test('stoksuz varyant stokta:false, stokAdedi her zaman null', async () => {
    const { urunler } = await topla();
    expect(urunler.find((x) => x.ad === 'The Out of Stock Snowboard')!.stokta).toBe(false);
    expect(urunler.find((x) => x.ad === 'The Videographer Snowboard')!.stokta).toBe(true);
    expect(urunler.every((u) => u.stokAdedi === null)).toBe(true);
  });

  test('url: onlineStoreUrl null ise primaryDomain + handle; cok varyantlida ?variant=; secenekler', async () => {
    const { urunler } = await topla();
    const tek = urunler.find((x) => x.ad === 'The Videographer Snowboard')!;
    expect(tek.url).toBe('https://butika-deneme.myshopify.com/products/the-videographer-snowboard');
    expect(tek.secenekler).toEqual({}); // Default Title atlanir
    expect(tek.kategori).toBe('snowboard');
    const cok = urunler.filter((x) => x.ad === 'The Complete Snowboard');
    expect(cok).toHaveLength(5);
    for (const v of cok) {
      const sayisal = v.disVaryantId!.split('/').pop();
      expect(v.url).toBe(`https://butika-deneme.myshopify.com/products/the-complete-snowboard?variant=${sayisal}`);
      expect(v.disUrunId).toMatch(/^gid:\/\/shopify\/Product\//);
    }
    expect(cok[0]!.secenekler.Color).toBeTruthy();
    expect(tek.gorseller.length).toBeGreaterThan(0);
  });

  test('onlineStoreUrl doluysa o kullanilir', async () => {
    const f = fikstur('urunler.json');
    f.data.products.pageInfo.hasNextPage = false;
    const n = f.data.products.nodes.find((x: { title: string }) => x.title === 'The Videographer Snowboard');
    n.onlineStoreUrl = 'https://magaza.example.com/products/ozel';
    const { ist } = istemci([f]);
    const sonuc = [];
    for await (const u of shopifyUrunleriniGetir(ist)) sonuc.push(u);
    expect(sonuc.find((u) => u.ad === 'The Videographer Snowboard')!.url).toBe('https://magaza.example.com/products/ozel');
  });
});

describe('sorgu metni', () => {
  test('musteri, e-posta, telefon, adres, IP alanlari yok; stok adedi istenmez', () => {
    expect(URUN_SORGUSU).not.toMatch(/customer|email|phone|Address|Ip\b|inventoryQuantity/);
  });
});

describe('shopifyIadePolitikasiGetir', () => {
  test('REFUND_POLICY metni etiketsiz ve en cok 600 karakter', async () => {
    const { ist } = istemci([fikstur('politikalar.json')]);
    const m = (await shopifyIadePolitikasiGetir(ist))!;
    expect(m).toContain('14 gün içinde');
    expect(m).not.toMatch(/[<>]/);
    expect(m.length).toBeLessThanOrEqual(600);
  });
  test('uzun metin 600 karakterde kesilir; politika yoksa null', async () => {
    const uzun = { data: { shop: { shopPolicies: [{ type: 'REFUND_POLICY', body: `<p>${'a '.repeat(700)}</p>` }] } } };
    expect((await shopifyIadePolitikasiGetir(istemci([uzun]).ist))!.length).toBeLessThanOrEqual(600);
    const yok = { data: { shop: { shopPolicies: [{ type: 'PRIVACY_POLICY', body: '<p>x</p>' }] } } };
    expect(await shopifyIadePolitikasiGetir(istemci([yok]).ist)).toBeNull();
  });
});
