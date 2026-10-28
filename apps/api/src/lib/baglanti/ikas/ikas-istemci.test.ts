import { beforeAll, describe, expect, test } from 'bun:test';
import { env } from '../../../env';
import { IkasSorguHatasi, IkasYetkiHatasi, ikasIstemci, ikasKimligi } from './ikas-istemci';
import type { IkasTokenlari } from './ikas-oauth';

beforeAll(() => {
  env.IKAS_CLIENT_ID = 'test-istemci';
  env.IKAS_CLIENT_SECRET = 'test-gizli';
  env.IKAS_YONLENDIRME_URL = 'https://api.example.test/geri';
});

const saatSonra = (sa: number) => new Date(Date.now() + sa * 3600_000).toISOString();
const ESKI_ERISIM = 'ESKI-ERISIM-TOKEN';
const ESKI_YENILEME = 'ESKI-YENILEME-TOKEN';
const tokenlar = (bitisAt: string): IkasTokenlari => ({ erisim: ESKI_ERISIM, yenileme: ESKI_YENILEME, bitisAt });

type Cevap = { durum: number; govde: unknown };

/** Token ucu ve GraphQL ucu icin sirayla cevap veren sahte fetch. */
function sahte(graphql: Cevap[], token: Cevap = { durum: 200, govde: { access_token: 'YENI-ERISIM', refresh_token: 'YENI-YENILEME', expires_in: 14400 } }) {
  const cagrilar: { url: string; yetki: string | null }[] = [];
  let g = 0;
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    cagrilar.push({ url: u, yetki: new Headers(init?.headers).get('authorization') });
    const c = u.includes('/oauth/token') ? token : graphql[Math.min(g++, graphql.length - 1)]!;
    return new Response(JSON.stringify(c.govde), { status: c.durum });
  }) as unknown as typeof fetch;
  const tokenIstekleri = () => cagrilar.filter((c) => c.url.includes('/oauth/token')).length;
  return { fn, cagrilar, tokenIstekleri };
}

const TAMAM = { durum: 200, govde: { data: { x: 1 } } };

describe('ikasIstemci', () => {
  test('401 gelince yenileyip tekrar dener, yeni cift bir kez yazilir', async () => {
    const s = sahte([{ durum: 401, govde: {} }, TAMAM]);
    const yazilan: IkasTokenlari[] = [];
    const ist = ikasIstemci(
      { magazaAdi: 'dev-x', tokenlar: tokenlar(saatSonra(3)), tokenlarDegisti: async (t) => void yazilan.push(t) },
      s.fn,
    );
    expect(await ist.sorgu<unknown>('query { x }')).toEqual({ x: 1 });
    expect(yazilan).toHaveLength(1);
    expect(yazilan[0]!.erisim).toBe('YENI-ERISIM');
    expect(s.cagrilar.at(-1)!.yetki).toBe('Bearer YENI-ERISIM');
  });

  test('HTTP 200 + LOGIN_REQUIRED ayni yolu izler', async () => {
    const s = sahte([{ durum: 200, govde: { errors: [{ message: 'x', extensions: { code: 'LOGIN_REQUIRED' } }] } }, TAMAM]);
    const yazilan: IkasTokenlari[] = [];
    const ist = ikasIstemci(
      { magazaAdi: 'dev-x', tokenlar: tokenlar(saatSonra(3)), tokenlarDegisti: async (t) => void yazilan.push(t) },
      s.fn,
    );
    expect(await ist.sorgu<unknown>('query { x }')).toEqual({ x: 1 });
    expect(yazilan).toHaveLength(1);
  });

  test('yenileme de basarisizsa IkasYetkiHatasi, mesajda token yok', async () => {
    const s = sahte([{ durum: 401, govde: {} }], { durum: 400, govde: { error: 'invalid_grant' } });
    const ist = ikasIstemci({ magazaAdi: 'dev-x', tokenlar: tokenlar(saatSonra(3)) }, s.fn);
    const hata = (await ist.sorgu('query { x }').catch((e) => e)) as Error;
    expect(hata).toBeInstanceOf(IkasYetkiHatasi);
    expect(hata.message).not.toContain(ESKI_ERISIM);
    expect(hata.message).not.toContain(ESKI_YENILEME);
    expect(hata.message).not.toContain('test-gizli');
  });

  test('yenilemeden sonra yine 401 ise IkasYetkiHatasi', async () => {
    const s = sahte([{ durum: 401, govde: {} }]);
    const ist = ikasIstemci({ magazaAdi: 'dev-x', tokenlar: tokenlar(saatSonra(3)) }, s.fn);
    await expect(ist.sorgu('query { x }')).rejects.toBeInstanceOf(IkasYetkiHatasi);
  });

  test('ayni baglantida eszamanli iki yenileme tek token istegi atar', async () => {
    const s = sahte([TAMAM]);
    const yazilan: IkasTokenlari[] = [];
    const baglanti = () => ({
      magazaAdi: 'dev-x',
      tokenlar: tokenlar(saatSonra(-1)),
      yenilemeKilidi: 'baglanti-1',
      tokenlarDegisti: async (t: IkasTokenlari) => void yazilan.push(t),
    });
    // Ayrı istemciler (ör. webhook ve tarama) aynı bağlantı için aynı anda yeniler.
    const [a, b] = [ikasIstemci(baglanti(), s.fn), ikasIstemci(baglanti(), s.fn)];
    await Promise.all([a.sorgu('query { x }'), b.sorgu('query { x }'), a.sorgu('query { x }')]);
    expect(s.tokenIstekleri()).toBe(1);
    expect(yazilan).toHaveLength(1);
    const graphql = s.cagrilar.filter((c) => !c.url.includes('/oauth/token'));
    expect(graphql).toHaveLength(3);
    expect(graphql.every((c) => c.yetki === 'Bearer YENI-ERISIM')).toBe(true);
    // Yenileme bitince kilit kalkar: sonraki yenileme yeniden istek atar.
    const c = ikasIstemci(baglanti(), s.fn);
    await c.sorgu('query { x }');
    expect(s.tokenIstekleri()).toBe(2);
  });

  test('farkli baglantilarin yenilemesi birbirini beklemez', async () => {
    const s = sahte([TAMAM]);
    const a = ikasIstemci({ magazaAdi: 'dev-x', tokenlar: tokenlar(saatSonra(-1)), yenilemeKilidi: 'k-a' }, s.fn);
    const b = ikasIstemci({ magazaAdi: 'dev-x', tokenlar: tokenlar(saatSonra(-1)), yenilemeKilidi: 'k-b' }, s.fn);
    await Promise.all([a.sorgu('query { x }'), b.sorgu('query { x }')]);
    expect(s.tokenIstekleri()).toBe(2);
  });

  test('bitise 1 saat varken yenileme istegi atilmaz', async () => {
    const s = sahte([TAMAM]);
    const ist = ikasIstemci({ magazaAdi: 'dev-x', tokenlar: tokenlar(saatSonra(1)) }, s.fn);
    await ist.sorgu('query { x }');
    expect(s.tokenIstekleri()).toBe(0);
    expect(s.cagrilar[0]!.yetki).toBe(`Bearer ${ESKI_ERISIM}`);
  });

  test('bitise 1 dk kala once yenilenir', async () => {
    const s = sahte([TAMAM]);
    const yazilan: IkasTokenlari[] = [];
    const ist = ikasIstemci(
      {
        magazaAdi: 'dev-x',
        tokenlar: tokenlar(new Date(Date.now() + 60_000).toISOString()),
        tokenlarDegisti: async (t) => void yazilan.push(t),
      },
      s.fn,
    );
    await ist.sorgu('query { x }');
    expect(s.tokenIstekleri()).toBe(1);
    expect(yazilan).toHaveLength(1);
    expect(s.cagrilar.at(-1)!.yetki).toBe('Bearer YENI-ERISIM');
  });

  test('diger GraphQL hatalari IkasSorguHatasi', async () => {
    const s = sahte([{ durum: 200, govde: { errors: [{ message: 'alan yok' }] } }]);
    const ist = ikasIstemci({ magazaAdi: 'dev-x', tokenlar: tokenlar(saatSonra(3)) }, s.fn);
    const hata = (await ist.sorgu('query { x }').catch((e) => e)) as Error;
    expect(hata).toBeInstanceOf(IkasSorguHatasi);
    expect(hata.message).not.toContain(ESKI_ERISIM);
  });
});

test('ikasKimligi: getAuthorizedApp + getMerchant', async () => {
  const s = sahte([
    {
      durum: 200,
      govde: {
        data: {
          getAuthorizedApp: { id: 'aa1', storeAppId: 'sa1', scope: 'read_products', deleted: false },
          getMerchant: { id: 'm1', storeName: 'dev-x' },
        },
      },
    },
  ]);
  const ist = ikasIstemci({ magazaAdi: 'dev-x', tokenlar: tokenlar(saatSonra(3)) }, s.fn);
  expect(await ikasKimligi(ist)).toEqual({
    authorizedAppId: 'aa1',
    storeAppId: 'sa1',
    scope: 'read_products',
    deleted: false,
    merchantId: 'm1',
  });
});

describe('ek hata yollari', () => {
  const yeni = (s: ReturnType<typeof sahte>) => ikasIstemci({ magazaAdi: 'dev-x', tokenlar: tokenlar(saatSonra(3)) }, s.fn);
  const hataAl = async (ist: ReturnType<typeof yeni>) => (await ist.sorgu<unknown>('query { x }').catch((e) => e)) as Error;

  test('data de errors da yoksa IkasSorguHatasi', async () => {
    const hata = await hataAl(yeni(sahte([{ durum: 200, govde: {} }])));
    expect(hata).toBeInstanceOf(IkasSorguHatasi);
    expect(hata.message).toBe('ikas_yanit_okunamadi');
  });

  test('HTTP 400 + errors: ileti yuzeye cikar, token yok', async () => {
    const hata = await hataAl(yeni(sahte([{ durum: 400, govde: { errors: [{ message: 'gecersiz alan' }] } }])));
    expect(hata).toBeInstanceOf(IkasSorguHatasi);
    expect(hata.message).toContain('gecersiz alan');
    expect(hata.message).not.toContain(ESKI_ERISIM);
  });

  test('HTTP 5xx IkasSorguHatasi', async () => {
    const hata = await hataAl(yeni(sahte([{ durum: 502, govde: {} }])));
    expect(hata).toBeInstanceOf(IkasSorguHatasi);
    expect(hata).not.toBeInstanceOf(IkasYetkiHatasi);
  });

  test('yenileme 5xx ise gecici hata olarak yayilir', async () => {
    const hata = await hataAl(yeni(sahte([{ durum: 401, govde: {} }], { durum: 503, govde: {} })));
    expect(hata).toBeInstanceOf(IkasSorguHatasi);
    expect(hata).not.toBeInstanceOf(IkasYetkiHatasi);
  });
});
