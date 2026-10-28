import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { siteGozlemi } from './butik-kontrol/site-gozlemi';
import { curlFetch, curlIstek } from './curl-fetch';

let sunucu: ReturnType<typeof Bun.serve>;
let kok = '';
const gelenBasliklar: Record<string, string | null> = {};

beforeAll(() => {
  sunucu = Bun.serve({
    port: 0,
    fetch(istek) {
      const yol = new URL(istek.url).pathname;
      gelenBasliklar.cookie = istek.headers.get('cookie');
      if (yol === '/eski')
        return new Response(null, { status: 301, headers: { location: '/yeni' } });
      if (yol === '/yok') return new Response('yok', { status: 404 });
      if (yol === '/yanki')
        return istek.text().then(
          (g) =>
            new Response(
              JSON.stringify({
                yontem: istek.method,
                govde: g,
                host: istek.headers.get('host'),
                x: istek.headers.get('x-deneme'),
              }),
            ),
        );
      if (yol === '/yavas') return Bun.sleep(5000).then(() => new Response('geç'));
      return new Response('<title>Yeni ğüşıöç</title>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  });
  kok = `http://127.0.0.1:${sunucu.port}`;
});
afterAll(() => sunucu.stop(true));

describe('curlFetch', () => {
  test('yönlendirmeyi izlemez, durum ve location döner', async () => {
    const r = await curlFetch(`${kok}/eski`);
    expect(r.status).toBe(301);
    expect(r.headers.get('location')).toBe('/yeni');
  });
  test('gövde UTF-8 okunur, 404 hata değildir', async () => {
    expect(await (await curlFetch(`${kok}/yeni`)).text()).toBe('<title>Yeni ğüşıöç</title>');
    expect((await curlFetch(`${kok}/yok`)).status).toBe(404);
  });
  test('bağlantı reddi ECONNREFUSED kodlu hata', async () => {
    const kapali = Bun.serve({ port: 0, fetch: () => new Response('') });
    const port = kapali.port;
    kapali.stop(true);
    await expect(curlFetch(`http://127.0.0.1:${port}/`)).rejects.toMatchObject({
      code: 'ECONNREFUSED',
    });
  });
  test('siteGozlemi curl ile: yönlendirme elle izlenir, pazar çerezi gider', async () => {
    const g = await siteGozlemi(`${kok}/eski`, curlFetch, { ulke: 'TR' });
    expect(g.status).toBe(200);
    expect(g.sonUrl).toBe(`${kok}/yeni`);
    expect(g.html).toContain('Yeni');
    expect(gelenBasliklar.cookie).toBe('localization=TR; cart_currency=TRY');
  });
});

describe('curlFetch adres güvenliği', () => {
  test('bayrak gibi ya da http dışı adres reddedilir', async () => {
    await expect(curlFetch('-o/tmp/x')).rejects.toThrow('gecersiz_adres');
    await expect(curlFetch('file:///etc/passwd')).rejects.toThrow('gecersiz_adres');
  });
});

describe('curlIstek', () => {
  test('POST gövdesi stdin ile gider, başlık iletilir', async () => {
    const r = await curlIstek(`${kok}/yanki`, {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
      headers: new Headers({ 'x-deneme': 'evet' }),
    });
    expect(await r.json()).toMatchObject({ yontem: 'POST', govde: '{"a":1}', x: 'evet' });
  });
  test('başlıkta satır sonu reddedilir', async () => {
    await expect(
      curlIstek(`${kok}/yanki`, { headers: { 'x-deneme': 'a\r\nx-kotu: 1' } }),
    ).rejects.toThrow('gecersiz_baslik');
  });
  test('baglanAdresi: DNS yerine verilen adrese bağlanır, Host korunur', async () => {
    const r = await curlIstek(
      `http://ornek-magaza.test:${sunucu.port}/yanki`,
      {},
      { baglanAdresi: '127.0.0.1' },
    );
    expect(((await r.json()) as { host: string }).host).toBe(`ornek-magaza.test:${sunucu.port}`);
  });
  test('iptal sinyali süreci durdurur', async () => {
    const c = new AbortController();
    const p = curlIstek(`${kok}/yavas`, { signal: c.signal });
    setTimeout(() => c.abort(new Error('iptal')), 100);
    await expect(p).rejects.toThrow('iptal');
  });
});

describe('siteGozlemi DNS hatası', () => {
  test('ikinci denemeden önce bekler', async () => {
    const beklemeler: number[] = [];
    let n = 0;
    const f = (async () => {
      n++;
      if (n === 1) throw Object.assign(new Error('Could not resolve host'), { code: 'ENOTFOUND' });
      return new Response('<title>X</title>');
    }) as unknown as typeof fetch;
    const g = await siteGozlemi('https://x.example', f, {
      bekle: async (ms) => {
        beklemeler.push(ms);
      },
    });
    expect(g.status).toBe(200);
    expect(beklemeler).toEqual([5000]);
  });
});
