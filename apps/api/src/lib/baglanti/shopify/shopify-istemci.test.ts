import { describe, expect, test } from 'bun:test';
import { ShopifySorguHatasi, ShopifyYetkiHatasi, shopifyIstemci } from './shopify-istemci';
import type { ShopifyTokenlari } from './shopify-oauth';
import { shopifySiparisleriniGetir } from './shopify-siparis';

const MAGAZA = 'deneme.myshopify.com';
const UYG = { clientId: 'test-istemci', secret: 'test-gizli' };
const ESKI_ERISIM = 'ESKI-ERISIM-TOKEN';
const ESKI_YENILEME = 'ESKI-YENILEME-TOKEN';
const saatSonra = (sa: number) => new Date(Date.now() + sa * 3600_000).toISOString();
const tokenlar = (bitisAt: string | null, yenileme: string | null = ESKI_YENILEME): ShopifyTokenlari => ({
  erisim: ESKI_ERISIM,
  yenileme,
  bitisAt,
});

type Cevap = { durum: number; govde: unknown };
const TAMAM = { durum: 200, govde: { data: { x: 1 } } };

/** Token ucu ve GraphQL ucu icin sirayla cevap veren sahte fetch. */
function sahte(
  graphql: Cevap[],
  token: Cevap = { durum: 200, govde: { access_token: 'YENI-ERISIM', refresh_token: 'YENI-YENILEME', expires_in: 3599 } },
) {
  const cagrilar: { url: string; yetki: string | null; govde: string }[] = [];
  let g = 0;
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    cagrilar.push({ url: u, yetki: new Headers(init?.headers).get('x-shopify-access-token'), govde: String(init?.body ?? '') });
    const c = u.includes('/admin/oauth/access_token') ? token : graphql[Math.min(g++, graphql.length - 1)]!;
    return new Response(JSON.stringify(c.govde), { status: c.durum });
  }) as unknown as typeof fetch;
  const tokenIstekleri = () => cagrilar.filter((c) => c.url.includes('/oauth/')).length;
  return { fn, cagrilar, tokenIstekleri };
}

describe('shopifyIstemci', () => {
  test('dogru uca X-Shopify-Access-Token basligiyla gider', async () => {
    const s = sahte([TAMAM]);
    const ist = shopifyIstemci({ magaza: MAGAZA, uyg: UYG, tokenlar: tokenlar(saatSonra(3)) }, s.fn);
    expect(await ist.sorgu<unknown>('query { x }')).toEqual({ x: 1 });
    expect(s.cagrilar[0]!.url).toMatch(/^https:\/\/deneme\.myshopify\.com\/admin\/api\/\d{4}-\d{2}\/graphql\.json$/);
    expect(s.cagrilar[0]!.yetki).toBe(ESKI_ERISIM);
  });

  test('401 gelince yenileyip tekrar dener, yeni cift bir kez yazilir', async () => {
    const s = sahte([{ durum: 401, govde: {} }, TAMAM]);
    const yazilan: ShopifyTokenlari[] = [];
    const ist = shopifyIstemci(
      { magaza: MAGAZA, uyg: UYG, tokenlar: tokenlar(saatSonra(3)), tokenlarDegisti: async (t) => void yazilan.push(t) },
      s.fn,
    );
    expect(await ist.sorgu<unknown>('query { x }')).toEqual({ x: 1 });
    expect(yazilan).toHaveLength(1);
    expect(yazilan[0]!.erisim).toBe('YENI-ERISIM');
    expect(s.cagrilar.at(-1)!.yetki).toBe('YENI-ERISIM');
  });

  test('yenileme de 401 verirse ShopifyYetkiHatasi, mesajda token yok', async () => {
    const s = sahte([{ durum: 401, govde: {} }], { durum: 401, govde: { error: 'invalid_grant' } });
    const ist = shopifyIstemci({ magaza: MAGAZA, uyg: UYG, tokenlar: tokenlar(saatSonra(3)) }, s.fn);
    const hata = (await ist.sorgu('query { x }').catch((e) => e)) as Error;
    expect(hata).toBeInstanceOf(ShopifyYetkiHatasi);
    for (const gizli of [ESKI_ERISIM, ESKI_YENILEME, UYG.secret]) expect(hata.message).not.toContain(gizli);
  });

  test('yenilemeden sonra yine 401 ise ShopifyYetkiHatasi', async () => {
    const s = sahte([{ durum: 401, govde: {} }]);
    const ist = shopifyIstemci({ magaza: MAGAZA, uyg: UYG, tokenlar: tokenlar(saatSonra(3)) }, s.fn);
    await expect(ist.sorgu('query { x }')).rejects.toBeInstanceOf(ShopifyYetkiHatasi);
  });

  test('bitisAt null (kalici token) iken yenileme hic denenmez; 401 dogrudan yetki hatasi', async () => {
    const s = sahte([TAMAM]);
    const ist = shopifyIstemci({ magaza: MAGAZA, uyg: UYG, tokenlar: tokenlar(null, null) }, s.fn);
    await ist.sorgu('query { x }');
    expect(s.tokenIstekleri()).toBe(0);
    const s2 = sahte([{ durum: 401, govde: {} }]);
    const ist2 = shopifyIstemci({ magaza: MAGAZA, uyg: UYG, tokenlar: tokenlar(null, null) }, s2.fn);
    await expect(ist2.sorgu('query { x }')).rejects.toBeInstanceOf(ShopifyYetkiHatasi);
    expect(s2.tokenIstekleri()).toBe(0);
  });

  test('bitise 1 saat varken yenileme yok; 5 dakikadan az kalmissa once yenilenir', async () => {
    const s = sahte([TAMAM]);
    await shopifyIstemci({ magaza: MAGAZA, uyg: UYG, tokenlar: tokenlar(saatSonra(1)) }, s.fn).sorgu('query { x }');
    expect(s.tokenIstekleri()).toBe(0);
    const s2 = sahte([TAMAM]);
    const yazilan: ShopifyTokenlari[] = [];
    const ist = shopifyIstemci(
      { magaza: MAGAZA, uyg: UYG, tokenlar: tokenlar(new Date(Date.now() + 60_000).toISOString()), tokenlarDegisti: async (t) => void yazilan.push(t) },
      s2.fn,
    );
    await ist.sorgu('query { x }');
    expect(s2.tokenIstekleri()).toBe(1);
    expect(yazilan).toHaveLength(1);
    expect(s2.cagrilar.at(-1)!.yetki).toBe('YENI-ERISIM');
  });

  test('429 ve THROTTLED gecici hata (ShopifySorguHatasi)', async () => {
    const ist = (c: Cevap) => shopifyIstemci({ magaza: MAGAZA, uyg: UYG, tokenlar: tokenlar(saatSonra(3)) }, sahte([c]).fn);
    await expect(ist({ durum: 429, govde: {} }).sorgu('q')).rejects.toBeInstanceOf(ShopifySorguHatasi);
    await expect(
      ist({ durum: 200, govde: { errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }] } }).sorgu('q'),
    ).rejects.toBeInstanceOf(ShopifySorguHatasi);
    await expect(ist({ durum: 503, govde: {} }).sorgu('q')).rejects.toBeInstanceOf(ShopifySorguHatasi);
  });
});

describe('ortak yenileme (yenilemeYoneticisi, guncelTokenlar)', () => {
  const YENI = { erisim: 'BASKA-SUREC-ERISIM', yenileme: 'BASKA-SUREC-YENILEME', bitisAt: saatSonra(1) };

  test('yonetici varsa yenileme onun icinden yapilir; donen cift kullanilir', async () => {
    const s = sahte([TAMAM]);
    const gorulen: ShopifyTokenlari[] = [];
    const ist = shopifyIstemci(
      {
        magaza: MAGAZA,
        uyg: UYG,
        tokenlar: tokenlar(new Date(Date.now() + 60_000).toISOString()),
        yenilemeYoneticisi: async (elimdeki, agdanYenile) => {
          gorulen.push(elimdeki);
          return agdanYenile();
        },
      },
      s.fn,
    );
    await ist.sorgu('query { x }');
    expect(gorulen).toHaveLength(1);
    expect(gorulen[0]!.yenileme).toBe(ESKI_YENILEME);
    expect(s.tokenIstekleri()).toBe(1);
    expect(s.cagrilar.at(-1)!.yetki).toBe('YENI-ERISIM');
  });

  test('yonetici baska surecin ciftini benimserse ag yenilemesi yapilmaz', async () => {
    const s = sahte([TAMAM]);
    const ist = shopifyIstemci(
      {
        magaza: MAGAZA,
        uyg: UYG,
        tokenlar: tokenlar(new Date(Date.now() + 60_000).toISOString()),
        yenilemeYoneticisi: async () => YENI,
      },
      s.fn,
    );
    await ist.sorgu('query { x }');
    expect(s.tokenIstekleri()).toBe(0);
    expect(s.cagrilar.at(-1)!.yetki).toBe(YENI.erisim);
  });

  test('yenileme yetki hatasi verir ama kalici kopyada daha yeni cift varsa onunla tekrar dener', async () => {
    const s = sahte([{ durum: 401, govde: {} }, TAMAM], { durum: 400, govde: { error: 'invalid_grant' } });
    const ist = shopifyIstemci(
      { magaza: MAGAZA, uyg: UYG, tokenlar: tokenlar(saatSonra(3)), guncelTokenlar: async () => YENI },
      s.fn,
    );
    expect(await ist.sorgu<unknown>('query { x }')).toEqual({ x: 1 });
    expect(s.cagrilar.at(-1)!.yetki).toBe(YENI.erisim);
  });

  test('kalici kopya ayni cifti tasiyorsa yetki hatasi aynen yukari cikar', async () => {
    const s = sahte([{ durum: 401, govde: {} }], { durum: 400, govde: { error: 'invalid_grant' } });
    const ist = shopifyIstemci(
      { magaza: MAGAZA, uyg: UYG, tokenlar: tokenlar(saatSonra(3)), guncelTokenlar: async () => tokenlar(saatSonra(3)) },
      s.fn,
    );
    await expect(ist.sorgu('query { x }')).rejects.toBeInstanceOf(ShopifyYetkiHatasi);
  });
});

describe('ACCESS_DENIED', () => {
  test('GraphQL ACCESS_DENIED gecici hata sayilir; yenileme denenmez', async () => {
    const s = sahte([{ durum: 200, govde: { errors: [{ message: 'not approved', extensions: { code: 'ACCESS_DENIED' } }] } }]);
    const ist = shopifyIstemci({ magaza: MAGAZA, uyg: UYG, tokenlar: tokenlar(saatSonra(3)) }, s.fn);
    const hata = await ist.sorgu('q').catch((e) => e);
    expect(hata).toBeInstanceOf(ShopifySorguHatasi);
    expect(hata).not.toBeInstanceOf(ShopifyYetkiHatasi);
    expect(s.tokenIstekleri()).toBe(0);
  });
});

describe('shopifySiparisleriniGetir', () => {
  const siparis = (id: string, no: string) => ({
    id,
    name: no,
    createdAt: '2026-10-24T20:41:14Z',
    updatedAt: '2026-10-24T20:49:34Z',
    cancelledAt: null,
    displayFinancialStatus: 'PAID',
    currencyCode: 'USD',
    taxesIncluded: false,
    currentTotalTaxSet: { shopMoney: { amount: '0.0' } },
    customerJourneySummary: { ready: true, firstVisit: null, lastVisit: null },
    lineItems: {
      nodes: [
        {
          title: 'x',
          quantity: 1,
          product: { id: 'gid://shopify/Product/1' },
          discountedUnitPriceAfterAllDiscountsSet: { shopMoney: { amount: '10.00' } },
        },
      ],
    },
    fulfillments: [],
  });
  const sayfa = (nodes: unknown[]) => ({
    durum: 200,
    govde: { data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } },
  });

  test('iki sorgunun ortak siparisi bir kez verilir; ready=false olan verilmez', async () => {
    const a = siparis('gid://shopify/Order/1', '#1');
    const ortak = siparis('gid://shopify/Order/2', '#2');
    const hazirDegil = { ...siparis('gid://shopify/Order/3', '#3'), customerJourneySummary: { ready: false, firstVisit: null, lastVisit: null } };
    const s = sahte([sayfa([a, ortak]), sayfa([ortak, hazirDegil])]);
    const ist = shopifyIstemci({ magaza: MAGAZA, uyg: UYG, tokenlar: tokenlar(null, null) }, s.fn);
    const simdi = new Date('2026-10-25T12:00:00Z');
    const sonuc: string[] = [];
    for await (const x of shopifySiparisleriniGetir(ist, new Date('2026-10-25T10:00:00Z'), simdi)) sonuc.push(x.disSiparisId);
    expect(sonuc).toEqual(['gid://shopify/Order/1', 'gid://shopify/Order/2']);
    const sorgular = s.cagrilar.map((c) => (JSON.parse(c.govde) as { variables: { q: string } }).variables.q);
    expect(sorgular[0]).toContain('updated_at:>=');
    expect(sorgular[1]).toContain('created_at:>=');
    expect(sorgular[1]).toContain('2026-10-22T12:00:00.000Z');
  });
});
