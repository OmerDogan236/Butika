import { beforeAll, describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { env } from '../../../env';
import {
  SHOPIFY_KAPSAMLARI,
  ShopifySorguHatasi,
  ShopifyYetkiHatasi,
  govdeImzasiGecerli,
  koduTokenaCevir,
  shopifyMagazaAdi,
  sorguImzasiGecerli,
  tokenYenile,
  yetkiAdresi,
} from './shopify-oauth';

const YONLENDIRME = 'https://api.example.test/katilim/shopify/geri-donus';
const SECRET = 'test-gizli-secret';
const UYG = { clientId: 'test-istemci', secret: SECRET };
const MAGAZA = 'butika-deneme.myshopify.com';

beforeAll(() => {
  env.SHOPIFY_YONLENDIRME_URL = YONLENDIRME;
});

function sahteFetch(
  durum: number,
  govde: unknown,
  yakala?: (url: string, init: RequestInit) => void,
) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    yakala?.(String(url), init ?? {});
    return new Response(JSON.stringify(govde), { status: durum });
  }) as unknown as typeof fetch;
}

describe('shopifyMagazaAdi', () => {
  test('temizler ve kucultur', () => {
    expect(shopifyMagazaAdi(' https://Butika-Deneme.myshopify.com/ ')).toBe(
      'butika-deneme.myshopify.com',
    );
    expect(shopifyMagazaAdi('a1.myshopify.com')).toBe('a1.myshopify.com');
  });
  test('gecersizleri reddeder', () => {
    expect(shopifyMagazaAdi('evil.com')).toBeNull();
    expect(shopifyMagazaAdi('a.myshopify.com.evil.com')).toBeNull();
    expect(shopifyMagazaAdi('')).toBeNull();
    expect(shopifyMagazaAdi('-a.myshopify.com')).toBeNull();
    expect(shopifyMagazaAdi('a/b.myshopify.com')).toBeNull();
  });
});

describe('sorguImzasiGecerli', () => {
  const params = {
    code: 'abc123',
    host: 'aG9zdA',
    shop: MAGAZA,
    state: 'st1',
    timestamp: '1700000000',
  };
  const hesapla = (p: Record<string, string>, secret = SECRET) =>
    createHmac('sha256', secret)
      .update(
        Object.keys(p)
          .sort()
          .map((k) => `${k}=${p[k]}`)
          .join('&'),
      )
      .digest('hex');
  const sorgu = (p: Record<string, string>, hmac: string, sirali = false) => {
    const u = new URLSearchParams();
    if (!sirali) u.set('hmac', hmac);
    for (const k of Object.keys(p).reverse()) u.set(k, p[k]!);
    if (sirali) u.set('hmac', hmac);
    return u;
  };

  test('dogru imza (hmac sirasi etkisiz)', () => {
    const h = hesapla(params);
    expect(sorguImzasiGecerli(sorgu(params, h), SECRET)).toBe(true);
    expect(sorguImzasiGecerli(sorgu(params, h, true), SECRET)).toBe(true);
  });
  test('parametre degisince veya baska secret ile false', () => {
    const h = hesapla(params);
    expect(sorguImzasiGecerli(sorgu({ ...params, state: 'x' }, h), SECRET)).toBe(false);
    expect(sorguImzasiGecerli(sorgu(params, h), 'baska')).toBe(false);
  });
  test('hmac yoksa veya bozuksa false', () => {
    expect(sorguImzasiGecerli(new URLSearchParams(params), SECRET)).toBe(false);
    expect(sorguImzasiGecerli(sorgu(params, 'zz'), SECRET)).toBe(false);
  });
});

describe('govdeImzasiGecerli', () => {
  const govde = '{"id":1}';
  const imza = createHmac('sha256', SECRET).update(govde).digest('base64');
  test('dogru / yanlis / baska secret', () => {
    expect(govdeImzasiGecerli(govde, imza, SECRET)).toBe(true);
    expect(govdeImzasiGecerli('{"id":2}', imza, SECRET)).toBe(false);
    expect(govdeImzasiGecerli(govde, imza, 'baska')).toBe(false);
    expect(govdeImzasiGecerli(govde, '', SECRET)).toBe(false);
  });
});

describe('yetkiAdresi', () => {
  test('parametreler birebir', () => {
    const u = new URL(yetkiAdresi(MAGAZA, 'test-istemci', 's1'));
    expect(`${u.origin}${u.pathname}`).toBe(`https://${MAGAZA}/admin/oauth/authorize`);
    expect(u.searchParams.get('client_id')).toBe('test-istemci');
    expect(u.searchParams.get('scope')).toBe('read_products,read_orders,read_legal_policies');
    expect(SHOPIFY_KAPSAMLARI).toBe('read_products,read_orders,read_legal_policies');
    expect(u.searchParams.get('redirect_uri')).toBe(YONLENDIRME);
    expect(u.searchParams.get('state')).toBe('s1');
    expect(u.searchParams.has('expiring')).toBe(false);
  });
  test('gecersiz magaza', () => {
    expect(() => yetkiAdresi('evil.com', 'c', 's')).toThrow('gecersiz_magaza');
  });
});

describe('token uc noktasi', () => {
  test('koduTokenaCevir: govde ve bitisAt', async () => {
    let url = '';
    let govde: Record<string, string> = {};
    const once = Date.now();
    const t = await koduTokenaCevir(
      MAGAZA,
      UYG,
      'kod1',
      sahteFetch(
        200,
        {
          access_token: 'a1',
          scope: 'x',
          expires_in: 3599,
          refresh_token: 'r1',
          refresh_token_expires_in: 777599,
        },
        (u, i) => {
          url = u;
          govde = JSON.parse(String(i.body));
          expect((i.headers as Record<string, string>)['content-type']).toBe('application/json');
        },
      ),
    );
    expect(url).toBe(`https://${MAGAZA}/admin/oauth/access_token`);
    expect(govde).toEqual({
      client_id: 'test-istemci',
      client_secret: SECRET,
      code: 'kod1',
      expiring: '1',
    });
    expect(t.erisim).toBe('a1');
    expect(t.yenileme).toBe('r1');
    const fark = new Date(t.bitisAt!).getTime() - once;
    expect(fark).toBeGreaterThan(3590_000);
    expect(fark).toBeLessThan(3610_000);
  });

  test('kalici token: yenileme ve bitisAt null', async () => {
    const t = await koduTokenaCevir(
      MAGAZA,
      UYG,
      'k',
      sahteFetch(200, { access_token: 'a1', scope: 'x' }),
    );
    expect(t).toEqual({ erisim: 'a1', yenileme: null, bitisAt: null });
  });

  test('tokenYenile govdesi', async () => {
    let govde: Record<string, string> = {};
    const t = await tokenYenile(
      MAGAZA,
      UYG,
      'eski',
      sahteFetch(200, { access_token: 'a2', expires_in: 3599, refresh_token: 'r2' }, (_u, i) => {
        govde = JSON.parse(String(i.body));
      }),
    );
    expect(govde).toEqual({
      client_id: 'test-istemci',
      client_secret: SECRET,
      grant_type: 'refresh_token',
      refresh_token: 'eski',
    });
    expect(t.erisim).toBe('a2');
    expect(t.yenileme).toBe('r2');
  });

  test('400 -> ShopifyYetkiHatasi, mesajda secret ve code yok', async () => {
    for (const cagri of [
      () =>
        koduTokenaCevir(MAGAZA, UYG, 'gizli-kod', sahteFetch(400, { error: 'invalid_request' })),
      () => tokenYenile(MAGAZA, UYG, 'gizli-yenileme', sahteFetch(400, { error: 'x' })),
    ]) {
      const hata = await cagri().catch((e) => e);
      expect(hata).toBeInstanceOf(ShopifyYetkiHatasi);
      expect(hata.message).not.toContain(SECRET);
      expect(hata.message).not.toContain('gizli-kod');
      expect(hata.message).not.toContain('gizli-yenileme');
    }
  });

  test('access_token yoksa yetki hatasi; 5xx ve ag hatasi sorgu hatasi', async () => {
    await expect(koduTokenaCevir(MAGAZA, UYG, 'k', sahteFetch(200, {}))).rejects.toBeInstanceOf(
      ShopifyYetkiHatasi,
    );
    await expect(koduTokenaCevir(MAGAZA, UYG, 'k', sahteFetch(503, {}))).rejects.toBeInstanceOf(
      ShopifySorguHatasi,
    );
    const agHatasi = (async () => {
      throw new Error('ag');
    }) as unknown as typeof fetch;
    await expect(tokenYenile(MAGAZA, UYG, 'r', agHatasi)).rejects.toBeInstanceOf(
      ShopifySorguHatasi,
    );
  });

  test('429, 408, 5xx gecici (sorgu hatasi); diger 4xx yetki hatasi', async () => {
    for (const durum of [429, 408, 500, 502, 503]) {
      await expect(tokenYenile(MAGAZA, UYG, 'r', sahteFetch(durum, {}))).rejects.toBeInstanceOf(
        ShopifySorguHatasi,
      );
      await expect(koduTokenaCevir(MAGAZA, UYG, 'k', sahteFetch(durum, {}))).rejects.toBeInstanceOf(
        ShopifySorguHatasi,
      );
    }
    for (const durum of [400, 401, 403, 404, 422]) {
      await expect(tokenYenile(MAGAZA, UYG, 'r', sahteFetch(durum, {}))).rejects.toBeInstanceOf(
        ShopifyYetkiHatasi,
      );
    }
  });

  test('200 ama govde okunamiyor (kesik/bozuk JSON) -> gecici sorgu hatasi, yetki hatasi degil', async () => {
    const bozuk = (async () =>
      new Response('{"access_token":"YARIM', { status: 200 })) as unknown as typeof fetch;
    for (const cagri of [
      () => tokenYenile(MAGAZA, UYG, 'r', bozuk),
      () => koduTokenaCevir(MAGAZA, UYG, 'k', bozuk),
    ]) {
      const hata = (await cagri().catch((e) => e)) as Error;
      expect(hata).toBeInstanceOf(ShopifySorguHatasi);
      expect(hata).not.toBeInstanceOf(ShopifyYetkiHatasi);
      expect(hata.message).toBe('shopify_token_yanit_okunamadi');
    }
  });

  test('gecersiz magazaya istek atmaz', async () => {
    await expect(koduTokenaCevir('evil.com', UYG, 'k', sahteFetch(200, {}))).rejects.toThrow(
      'gecersiz_magaza',
    );
  });
});
