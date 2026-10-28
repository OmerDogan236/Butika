import { expect, test } from 'bun:test';
import { pazarBaglami, pazarCerezi, pazarParaBirimi, pazarParaUyusmazligi } from './pazar';
import { createRetailerFetch } from './retailer-http';

test('bilinen pazarların para birimi; bilinmeyende kural yok', () => {
  expect(pazarParaBirimi('TR')).toBe('TRY');
  expect(pazarParaBirimi('tr')).toBe('TRY');
  expect(pazarParaBirimi('US')).toBe('USD');
  expect(pazarParaBirimi('DE')).toBeNull();
  expect(pazarParaBirimi(null)).toBeNull();
});

test('Shopify pazar çerezi ülke ve para birimini taşır', () => {
  expect(pazarCerezi('TR')).toBe('localization=TR; cart_currency=TRY');
  expect(pazarCerezi('DE')).toBeNull();
});

test('pazar para birimi dışındaki gözlem uyuşmazlıktır', () => {
  expect(pazarParaUyusmazligi('TR', 'EUR')).toBe('pazar_para_birimi: TRY bekleniyordu, EUR geldi');
  expect(pazarParaUyusmazligi('TR', 'try')).toBeNull();
  expect(pazarParaUyusmazligi('DE', 'EUR')).toBeNull();
  expect(pazarParaUyusmazligi(null, 'EUR')).toBeNull();
});

test('mağaza isteği pazar bağlamındaysa pazar çerezini gönderir', async () => {
  const cerezler: (string | null)[] = [];
  const request = createRetailerFetch({ spacingMs: 0, globalSpacingMs: 0,
    fetch: async (_url, init) => { cerezler.push(new Headers(init?.headers).get('cookie')); return new Response('{}'); } });
  await pazarBaglami.run({ ulke: 'TR' }, () => request('https://store.test/a', { headers: { accept: 'application/json' } }));
  await request('https://store.test/b');
  await pazarBaglami.run({ ulke: 'TR' }, () => request('https://store.test/c', { headers: { cookie: 'kendi=1' } }));
  expect(cerezler).toEqual(['localization=TR; cart_currency=TRY', null, 'kendi=1']);
});

test('pazar çerezi mevcut başlıkları korur', async () => {
  let basliklar: Headers | null = null;
  const request = createRetailerFetch({ spacingMs: 0, globalSpacingMs: 0,
    fetch: async (_url, init) => { basliklar = new Headers(init?.headers); return new Response('{}'); } });
  await pazarBaglami.run({ ulke: 'TR' }, () => request('https://store.test/x', { headers: { accept: 'text/html', 'accept-language': 'tr-TR' } }));
  expect(basliklar!.get('accept')).toBe('text/html');
  expect(basliklar!.get('accept-language')).toBe('tr-TR');
  expect(basliklar!.get('cookie')).toBe('localization=TR; cart_currency=TRY');
});
