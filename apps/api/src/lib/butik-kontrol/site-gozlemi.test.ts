import { describe, expect, test } from 'bun:test';
import { siteGozlemi } from './site-gozlemi';

type Cagri = { url: string; init?: RequestInit };

function sahteFetch(yanitla: (url: string, n: number) => Response | Promise<Response>) {
  const cagrilar: Cagri[] = [];
  const f = (async (girdi: string | URL | Request, init?: RequestInit) => {
    const url = typeof girdi === 'string' ? girdi : girdi instanceof URL ? girdi.href : girdi.url;
    cagrilar.push({ url, init });
    return yanitla(url, cagrilar.length);
  }) as unknown as typeof fetch;
  return { f, cagrilar };
}

function yanit(govde: string, init: ResponseInit & { url?: string } = {}): Response {
  const r = new Response(govde, { status: init.status ?? 200, headers: init.headers });
  if (init.url) Object.defineProperty(r, 'url', { value: init.url });
  return r;
}

describe('siteGozlemi', () => {
  test('düz sayfa: html, status, sonUrl; Safari UA ve elle yönlendirme', async () => {
    const { f, cagrilar } = sahteFetch((url) =>
      url === 'https://vega.com'
        ? yanit('', { status: 301, headers: { location: 'https://www.vega.com/tr' } })
        : yanit('<title>Vega</title>'),
    );
    const g = await siteGozlemi('https://vega.com', f);
    expect(g).toEqual({
      hata: null,
      status: 200,
      sonUrl: 'https://www.vega.com/tr',
      html: '<title>Vega</title>',
      shopifyParaBirimi: null,
    });
    expect(cagrilar.map((c) => c.url)).toEqual(['https://vega.com', 'https://www.vega.com/tr']);
    const h = new Headers(cagrilar[0]!.init?.headers);
    expect(h.get('user-agent')).toContain('Safari');
    expect(cagrilar[0]!.init?.redirect).toBe('manual');
    expect(cagrilar[0]!.init?.signal).toBeDefined();
  });

  test('göreli Location adresi mevcut adrese göre çözülür', async () => {
    const { f, cagrilar } = sahteFetch((url) => {
      if (url === 'https://x.example/')
        return yanit('', { status: 302, headers: { location: '/tr/' } });
      if (url === 'https://x.example/tr/')
        return yanit('', { status: 307, headers: { location: 'anasayfa?a=1' } });
      return yanit('<title>X</title>');
    });
    const g = await siteGozlemi('https://x.example/', f);
    expect(g.hata).toBeNull();
    expect(g.sonUrl).toBe('https://x.example/tr/anasayfa?a=1');
    expect(cagrilar).toHaveLength(3);
  });

  test('Butika alan adına yönlenen adımda durulur, istek atılmaz, tekrar denenmez', async () => {
    const { f, cagrilar } = sahteFetch((url) =>
      url === 'https://eski.example'
        ? yanit('', { status: 301, headers: { location: 'https://ara.example/' } })
        : yanit('', { status: 302, headers: { location: 'https://admin.butika.ai/giris' } }),
    );
    const g = await siteGozlemi('https://eski.example', f);
    expect(g.hata).toStartWith('butika_yonlendirme');
    expect(g.status).toBeNull();
    expect(cagrilar.map((c) => c.url)).toEqual(['https://eski.example', 'https://ara.example/']);
  });

  test('8 adımdan fazla yönlendirme hata olur', async () => {
    const { f, cagrilar } = sahteFetch((_u, n) =>
      yanit('', { status: 302, headers: { location: `https://x.example/${n}` } }),
    );
    const g = await siteGozlemi('https://x.example/0', f);
    expect(g.hata).toBe('cok_fazla_yonlendirme');
    expect(cagrilar).toHaveLength(9);
  });

  test('yönlendirme sırasında ağ hatası: zincir bir kez baştan denenir', async () => {
    const { f, cagrilar } = sahteFetch((url, n) => {
      if (url === 'https://x.example')
        return yanit('', { status: 301, headers: { location: '/b' } });
      if (n === 2) throw Object.assign(new Error('reset'), { code: 'ECONNRESET' });
      return yanit('<title>X</title>');
    });
    const g = await siteGozlemi('https://x.example', f);
    expect(g.hata).toBeNull();
    expect(g.sonUrl).toBe('https://x.example/b');
    expect(cagrilar).toHaveLength(4);
  });

  test('Shopify: etkin para birimi sayfadan okunur, pazar çerezi gönderilir', async () => {
    const { f, cagrilar } = sahteFetch(() =>
      yanit(
        '<script>Shopify.shop = "x.myshopify.com"; Shopify.currency = {"active":"TRY","rate":"49.7"};</script>',
      ),
    );
    const g = await siteGozlemi('https://shop.example', f, { ulke: 'TR' });
    expect(g.shopifyParaBirimi).toBe('TRY');
    expect(cagrilar).toHaveLength(1);
    const basliklar = cagrilar[0]?.init?.headers as Record<string, string>;
    expect(basliklar.cookie).toBe('localization=TR; cart_currency=TRY');
  });

  test('Shopify ama etkin para birimi yoksa null; ülke yoksa çerez yok', async () => {
    const { f, cagrilar } = sahteFetch(() => yanit('<link href="https://cdn.shopify.com/x.css">'));
    const g = await siteGozlemi('https://shop.example', f);
    expect(g.hata).toBeNull();
    expect(g.shopifyParaBirimi).toBeNull();
    expect((cagrilar[0]?.init?.headers as Record<string, string>).cookie).toBeUndefined();
  });

  test('429: Retry-After kadar bekleyip tekrar dener (en çok 30 sn)', async () => {
    const beklemeler: number[] = [];
    const { f, cagrilar } = sahteFetch((_url, n) =>
      n === 1
        ? yanit('', { status: 429, headers: { 'retry-after': '120' } })
        : yanit('<title>Tamam</title>'),
    );
    const g = await siteGozlemi('https://x.example', f, {
      bekle: async (ms) => {
        beklemeler.push(ms);
      },
    });
    expect(g.status).toBe(200);
    expect(cagrilar).toHaveLength(2);
    expect(beklemeler).toEqual([30_000]);
  });

  test('429 sürerse iki tekrardan sonra 429 döner', async () => {
    const beklemeler: number[] = [];
    const { f, cagrilar } = sahteFetch(() => yanit('', { status: 429 }));
    const g = await siteGozlemi('https://x.example', f, {
      bekle: async (ms) => {
        beklemeler.push(ms);
      },
    });
    expect(g.status).toBe(429);
    expect(cagrilar).toHaveLength(3);
    expect(beklemeler).toEqual([10_000, 10_000]);
  });

  test('ağ hatasında bir kez tekrar, sonra hata kodu', async () => {
    const { f, cagrilar } = sahteFetch(() => {
      throw Object.assign(new Error('Unable to connect'), { code: 'ConnectionRefused' });
    });
    const g = await siteGozlemi('https://kapali.example', f);
    expect(cagrilar).toHaveLength(2);
    expect(g.status).toBeNull();
    expect(g.hata).toContain('ECONNREFUSED');
  });

  test('zaman aşımı "timeout" olarak yazılır; ikinci deneme başarılıysa hata yok', async () => {
    const zaman = sahteFetch(() => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    expect((await siteGozlemi('https://yavas.example', zaman.f)).hata).toContain('timeout');
    const ikinci = sahteFetch((_u, n) => {
      if (n === 1) throw Object.assign(new Error('reset'), { code: 'ECONNRESET' });
      return yanit('ok');
    });
    const g = await siteGozlemi('https://x.example', ikinci.f);
    expect(g.hata).toBeNull();
    expect(ikinci.cagrilar).toHaveLength(2);
  });

  test('HTTP hata durumu tekrarlanmaz', async () => {
    const { f, cagrilar } = sahteFetch(() => yanit('yok', { status: 404 }));
    const g = await siteGozlemi('https://x.example', f);
    expect(g.status).toBe(404);
    expect(cagrilar).toHaveLength(1);
  });

  test('gövde en çok ~1.5 MB okunur', async () => {
    const buyuk = 'a'.repeat(3 * 1024 * 1024);
    const { f } = sahteFetch(() => yanit(buyuk));
    const g = await siteGozlemi('https://x.example', f);
    expect(g.html.length).toBeLessThanOrEqual(1.5 * 1024 * 1024 + 64 * 1024);
    expect(g.html.length).toBeGreaterThan(1024 * 1024);
  });

  test('Butika alan adlarına istek atılmaz', async () => {
    const { f, cagrilar } = sahteFetch(() => yanit('x'));
    const g = await siteGozlemi('https://admin.butika.ai/x', f);
    expect(cagrilar).toHaveLength(0);
    expect(g.hata).not.toBeNull();
  });
});
