import { beforeAll, describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { env } from '../../../env';
import { IkasSorguHatasi, IkasYetkiHatasi, ikasOAuth } from './ikas-oauth';

const YONLENDIRME = 'https://api.example.test/katilim/ikas/geri-donus';

beforeAll(() => {
  env.IKAS_CLIENT_ID = 'test-istemci';
  env.IKAS_CLIENT_SECRET = 'test-gizli';
  env.IKAS_YONLENDIRME_URL = YONLENDIRME;
});

const imza = (m: string) => createHmac('sha256', 'test-gizli').update(m).digest('hex');

function sahteFetch(durum: number, govde: unknown, yakala?: (url: string, init: RequestInit) => void) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    yakala?.(String(url), init ?? {});
    return new Response(JSON.stringify(govde), { status: durum });
  }) as unknown as typeof fetch;
}

describe('yetkiAdresi', () => {
  test('izin adresini kurar', () => {
    const u = new URL(ikasOAuth.yetkiAdresi('dev-x', 's1'));
    expect(`${u.origin}${u.pathname}`).toBe('https://dev-x.myikas.com/api/admin/oauth/authorize');
    expect(u.searchParams.get('client_id')).toBe('test-istemci');
    expect(u.searchParams.get('redirect_uri')).toBe(YONLENDIRME);
    expect(u.searchParams.get('scope')).toBe('read_products,read_orders,read_inventories');
    expect(u.searchParams.get('state')).toBe('s1');
  });

  test('gecersiz magaza adini reddeder', () => {
    expect(() => ikasOAuth.yetkiAdresi('kötü/ad', 's1')).toThrow('gecersiz_magaza');
    expect(() => ikasOAuth.yetkiAdresi('', 's1')).toThrow('gecersiz_magaza');
    expect(() => ikasOAuth.yetkiAdresi('A.b', 's1')).toThrow('gecersiz_magaza');
  });
});

describe('token uc noktasi', () => {
  test('koduTokenaCevir: form govdesi ve bitisAt', async () => {
    let url = '';
    let govde = '';
    const once = Date.now();
    const t = await ikasOAuth.koduTokenaCevir(
      'dev-x',
      'kod1',
      sahteFetch(200, { access_token: 'a1', refresh_token: 'r1', expires_in: 14400 }, (u, i) => {
        url = u;
        govde = String(i.body);
      }),
    );
    expect(url).toBe('https://dev-x.myikas.com/api/admin/oauth/token');
    const p = new URLSearchParams(govde);
    expect(p.get('grant_type')).toBe('authorization_code');
    expect(p.get('code')).toBe('kod1');
    expect(p.get('redirect_uri')).toBe(YONLENDIRME);
    expect(p.get('client_id')).toBe('test-istemci');
    expect(t.erisim).toBe('a1');
    expect(t.yenileme).toBe('r1');
    const fark = new Date(t.bitisAt).getTime() - once;
    expect(fark).toBeGreaterThan(4 * 3600_000 - 5000);
    expect(fark).toBeLessThan(4 * 3600_000 + 5000);
  });

  test('uc nokta 400 donerse IkasYetkiHatasi', async () => {
    await expect(ikasOAuth.koduTokenaCevir('dev-x', 'k', sahteFetch(400, { error: 'invalid_grant' }))).rejects.toBeInstanceOf(
      IkasYetkiHatasi,
    );
  });

  test('tokenYenile: refresh_token govdesi; access_token yoksa IkasYetkiHatasi', async () => {
    let govde = '';
    const t = await ikasOAuth.tokenYenile(
      'dev-x',
      'eskir',
      sahteFetch(200, { access_token: 'a2', refresh_token: 'r2', expires_in: 100 }, (_u, i) => {
        govde = String(i.body);
      }),
    );
    const p = new URLSearchParams(govde);
    expect(p.get('grant_type')).toBe('refresh_token');
    expect(p.get('refresh_token')).toBe('eskir');
    expect(t.erisim).toBe('a2');
    await expect(ikasOAuth.tokenYenile('dev-x', 'eskir', sahteFetch(200, {}))).rejects.toBeInstanceOf(IkasYetkiHatasi);
  });
});

describe('imzalar', () => {
  test('kodImzasiGecerli', () => {
    expect(ikasOAuth.kodImzasiGecerli('kod1', imza('kod1'))).toBe(true);
    expect(ikasOAuth.kodImzasiGecerli('kod1', imza('baska'))).toBe(false);
    expect(ikasOAuth.kodImzasiGecerli('kod1', 'kisa')).toBe(false);
  });

  test('veriImzasiGecerli', () => {
    expect(ikasOAuth.veriImzasiGecerli('{"a":1}', imza('{"a":1}'))).toBe(true);
    expect(ikasOAuth.veriImzasiGecerli('{"a":2}', imza('{"a":1}'))).toBe(false);
  });

  test('kurulumImzasiGecerli: 120 sn siniri', () => {
    const simdi = new Date('2026-10-23T10:00:00Z');
    const ts = (sn: number) => String(Math.floor(simdi.getTime() / 1000) - sn);
    const p = (sn: number) => ({
      storeName: 'dev-x',
      merchantId: 'm1',
      timestamp: ts(sn),
      signature: imza(`dev-xm1${ts(sn)}`),
    });
    expect(ikasOAuth.kurulumImzasiGecerli(p(10), simdi)).toBe(true);
    expect(ikasOAuth.kurulumImzasiGecerli(p(121), simdi)).toBe(false);
    expect(ikasOAuth.kurulumImzasiGecerli({ ...p(10), signature: 'x'.repeat(64) }, simdi)).toBe(false);
  });
});

describe('gecici hatalar ve eksik sir', () => {
  const agHatasi = (async () => {
    throw new Error('ag');
  }) as unknown as typeof fetch;

  test('ag hatasi ve 5xx IkasSorguHatasi, 4xx ve tokensiz 200 IkasYetkiHatasi', async () => {
    for (const f of [
      () => ikasOAuth.koduTokenaCevir('dev-x', 'k', agHatasi),
      () => ikasOAuth.tokenYenile('dev-x', 'r', agHatasi),
      () => ikasOAuth.koduTokenaCevir('dev-x', 'k', sahteFetch(503, {})),
      () => ikasOAuth.tokenYenile('dev-x', 'r', sahteFetch(500, {})),
    ]) {
      const hata = await f().catch((e) => e);
      expect(hata).toBeInstanceOf(IkasSorguHatasi);
      expect(hata).not.toBeInstanceOf(IkasYetkiHatasi);
    }
    await expect(ikasOAuth.tokenYenile('dev-x', 'r', sahteFetch(401, {}))).rejects.toBeInstanceOf(IkasYetkiHatasi);
  });

  test('gecersiz magaza adi fetch atilmadan reddedilir', async () => {
    let cagri = 0;
    const f = (async () => {
      cagri++;
      return new Response('{}');
    }) as unknown as typeof fetch;
    await expect(ikasOAuth.koduTokenaCevir('kötü/ad', 'k', f)).rejects.toThrow('gecersiz_magaza');
    expect(cagri).toBe(0);
  });

  test('bos gizli anahtarla imzalar gecersiz', () => {
    const eski = env.IKAS_CLIENT_SECRET;
    env.IKAS_CLIENT_SECRET = '';
    try {
      const bos = createHmac('sha256', '').update('kod1').digest('hex');
      expect(ikasOAuth.kodImzasiGecerli('kod1', bos)).toBe(false);
      const ts = String(Math.floor(Date.now() / 1000));
      const imzaBos = createHmac('sha256', '').update(`dev-xm1${ts}`).digest('hex');
      expect(ikasOAuth.kurulumImzasiGecerli({ storeName: 'dev-x', merchantId: 'm1', timestamp: ts, signature: imzaBos })).toBe(false);
    } finally {
      env.IKAS_CLIENT_SECRET = eski;
    }
  });
});
