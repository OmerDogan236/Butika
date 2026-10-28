import { describe, expect, test } from 'bun:test';

import { instagramProfili as profil, instagramServisiAcikMi } from './instagram-profil';

// Meta servisi açıkmış gibi (ortam değişkenlerinden bağımsız).
const ayar = { igUserId: '17841400000000000', token: 'test-anahtari' };
const instagramProfili = (hesap: string, deps: { fetch: typeof fetch }) => profil(hesap, { ...deps, ayar });

const yanit = (govde: unknown, durum = 200) =>
  (async () => new Response(JSON.stringify(govde), { status: durum })) as unknown as typeof fetch;

describe('instagramProfili', () => {
  test('anahtar varsa servis açık, yoksa kapalı ve istek atılmaz', async () => {
    expect(instagramServisiAcikMi(ayar)).toBe(true);
    expect(instagramServisiAcikMi({})).toBe(false);
    expect(await profil('manukaofficial', { ayar: {}, fetch: yanit({}) })).toBeNull();
  });

  test('işletme hesabı: ad ve biyografideki site (https eklenir)', async () => {
    let istenen = '';
    let anahtar = '';
    const sahte = (async (url: string, init?: RequestInit) => {
      istenen = url;
      anahtar = new Headers(init?.headers).get('authorization') ?? '';
      return new Response(
        JSON.stringify({
          business_discovery: { username: 'ManukaOfficial', name: 'MANUKA', website: 'www.manuka.com.tr', biography: 'Kadın giyim' },
        }),
      );
    }) as unknown as typeof fetch;
    expect(await instagramProfili('manukaofficial', { fetch: sahte })).toEqual({
      hesap: 'manukaofficial',
      ad: 'MANUKA',
      website: 'https://www.manuka.com.tr',
      biyografi: 'Kadın giyim',
    });
    expect(decodeURIComponent(istenen)).toContain('business_discovery.username(manukaofficial)');
    expect(istenen).not.toContain('test-anahtari'); // anahtar adreste değil, başlıkta
    expect(anahtar).toBe('Bearer test-anahtari');
  });

  test('kişisel hesap / bulunamadı (hata 110) → null', async () => {
    expect(await instagramProfili('birisi', { fetch: yanit({ error: { code: 110 } }, 400) })).toBeNull();
  });

  test('sitesi olmayan işletme hesabı: website null', async () => {
    const p = await instagramProfili('butik', { fetch: yanit({ business_discovery: { username: 'butik' } }) });
    expect(p?.website).toBeNull();
  });

  test('geçersiz hesap adı hiç istek atmaz', async () => {
    let cagrildi = false;
    const sahte = (async () => {
      cagrildi = true;
      return new Response('{}');
    }) as unknown as typeof fetch;
    expect(await instagramProfili('kötü){ad}', { fetch: sahte })).toBeNull();
    expect(cagrildi).toBe(false);
  });
});
