import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { durumuCevir, tamIptalMi } from '../kurallar';
import { shopifyIstemci } from './shopify-istemci';
import { SIPARIS_ALANLARI, SIPARIS_SORGUSU, type HamShopifySiparis, shopifySiparisGetir, siparisAyristir } from './shopify-siparis';

const ham = (ad: string): HamShopifySiparis => JSON.parse(readFileSync(new URL(`./fixtures/${ad}`, import.meta.url), 'utf8')).data.order;
/** Gercek kargoda fiksturunde ready=false; ayristirici icin hazir hale getirilir. */
const hazir = (h: HamShopifySiparis): HamShopifySiparis => ({
  ...h,
  customerJourneySummary: { ready: true, firstVisit: null, lastVisit: null },
});

describe('siparisAyristir', () => {
  test('siparis-butika: atif, tutar, kargo', () => {
    const s = siparisAyristir(ham('siparis-butika.json'))!;
    expect(s.utmSource).toBe('butika');
    expect(s.utmContent).toBe('spike1');
    expect(s.tutarMinor).toBe(2495);
    expect(s.currency).toBe('USD');
    expect(s.siparisNo).toBe('#1001');
    expect(s.disSiparisId).toBe('gid://shopify/Order/18966027304994');
    expect(s.guncellemeAt?.toISOString()).toBe('2026-10-24T20:49:34.000Z');
    expect(s.satirlar).toEqual([
      { ad: 'Selling Plans Ski Wax', adet: 1, birimFiyatMinor: 2495, disUrunId: 'gid://shopify/Product/15485653581858' },
    ]);
    expect(s.takipNo).toBe('TEST123456789');
    expect(s.kargoFirmasi).toBe('Yurtiçi Kargo'); // company: Other, alan adindan
  });

  test('musteri verisi sonuca sizmaz', () => {
    const h = ham('siparis-butika.json') as unknown as Record<string, unknown>;
    const sahte = ['Ayse Musteri', 'ayse@ornek.test', '+905550000000', 'Gizli Sokak 5', '203.0.113.9'];
    h.customer = { displayName: sahte[0], email: sahte[1] };
    h.email = sahte[1];
    h.phone = sahte[2];
    h.shippingAddress = { address1: sahte[3], city: 'Istanbul' };
    h.billingAddress = { address1: sahte[3] };
    h.clientIp = sahte[4];
    const json = JSON.stringify(siparisAyristir(h as unknown as HamShopifySiparis));
    for (const d of sahte) expect(json).not.toContain(d);
    expect(json).not.toContain('Istanbul');
  });

  test('ready=false -> null', () => {
    expect(siparisAyristir(ham('siparis-butika-hazir-degil.json'))).toBeNull();
  });

  test('siparis-dogrudan: utmSource null', () => {
    expect(siparisAyristir(ham('siparis-dogrudan.json'))!.utmSource).toBeNull();
  });

  test('atif: lastVisit once, sonra firstVisit; UTM yoksa landingPage sorgu dizgesi', () => {
    const h = ham('siparis-butika.json');
    const baska = { landingPage: '/', utmParameters: { source: 'google', content: 'x' } };
    const butika = { landingPage: '/p', utmParameters: { source: 'butika', content: 'ilk' } };
    expect(siparisAyristir({ ...h, customerJourneySummary: { ready: true, firstVisit: butika, lastVisit: baska } })!.utmContent).toBe('ilk');
    const son = { landingPage: '/p', utmParameters: { source: 'butika', content: 'son' } };
    expect(siparisAyristir({ ...h, customerJourneySummary: { ready: true, firstVisit: butika, lastVisit: son } })!.utmContent).toBe('son');
    const yalnizLanding = { landingPage: '/p?utm_source=butika&utm_content=abc123', utmParameters: null };
    const s = siparisAyristir({ ...h, customerJourneySummary: { ready: true, firstVisit: null, lastVisit: yalnizLanding } })!;
    expect([s.utmSource, s.utmContent]).toEqual(['butika', 'abc123']);
    const hicbiri = siparisAyristir({ ...h, customerJourneySummary: { ready: true, firstVisit: baska, lastVisit: baska } })!;
    expect([hicbiri.utmSource, hicbiri.utmContent]).toEqual([null, null]);
  });

  test('siparis-kargoda: kargoda, takip no dolu, tutar 2495', () => {
    const s = siparisAyristir(hazir(ham('siparis-kargoda.json')))!;
    expect(durumuCevir(s.hamDurum).durum).toBe('kargoda');
    expect(s.takipNo).toBeTruthy();
    expect(s.takipUrl).toContain('yurticikargo.com');
    expect(s.tutarMinor).toBe(2495);
  });

  test('siparis-iptal-odenmedi: odenmedi ve tam iptal', () => {
    const s = siparisAyristir(hazir(ham('siparis-iptal-odenmedi.json')))!;
    expect(durumuCevir(s.hamDurum).durum).toBe('odenmedi');
    expect(tamIptalMi(s.hamDurum)).toBe(true);
  });

  test('Review Focus 5: iptalsiz tam iade -> iptal gorunur, odendi, tam iptal DEGIL; komisyon tabani orijinal adet', () => {
    const s = siparisAyristir(hazir(ham('siparis-iade.json')))!;
    const d = durumuCevir(s.hamDurum);
    expect(d.durum).toBe('iptal');
    expect(d.odendi).toBe(true);
    expect(tamIptalMi(s.hamDurum)).toBe(false);
    expect(s.tutarMinor).toBe(2495); // current* alanlari 0'a inse de
  });

  test('odenmis + cancelledAt -> tam iptal', () => {
    const h = hazir(ham('siparis-butika.json'));
    const s = siparisAyristir({ ...h, cancelledAt: '2026-10-25T10:00:00Z' })!;
    expect(s.hamDurum).toEqual({ status: 'CANCELLED', odeme: 'PAID', paket: 'CANCELLED' });
    expect(tamIptalMi(s.hamDurum)).toBe(true);
  });

  test('siparis-iptal-odendi fiksturu tam iptal', () => {
    const s = siparisAyristir(hazir(ham('siparis-iptal-odendi.json')))!;
    expect(tamIptalMi(s.hamDurum)).toBe(true);
    expect(s.hamDurum.odeme).toBe('PAID');
  });

  test('odeme/paket ceviri tablosu', () => {
    const h = hazir(ham('siparis-butika.json'));
    const odeme = (d: string) => siparisAyristir({ ...h, displayFinancialStatus: d })!.hamDurum.odeme;
    expect([odeme('PAID'), odeme('PARTIALLY_REFUNDED'), odeme('REFUNDED'), odeme('PARTIALLY_PAID'), odeme('PENDING'), odeme('VOIDED')]).toEqual([
      'PAID', 'PAID', 'PAID', 'PARTIALLY_PAID', 'PENDING', 'VOIDED',
    ]);
    const paket = (f: HamShopifySiparis['fulfillments']) => siparisAyristir({ ...h, fulfillments: f })!.hamDurum.paket;
    expect(paket([])).toBeNull();
    expect(paket([{ status: 'SUCCESS', displayStatus: 'DELIVERED', trackingInfo: [] }])).toBe('DELIVERED');
    expect(
      paket([
        { status: 'SUCCESS', displayStatus: 'DELIVERED', trackingInfo: [] },
        { status: 'SUCCESS', displayStatus: 'IN_TRANSIT', trackingInfo: [] },
      ]),
    ).toBe('FULFILLED');
    expect(siparisAyristir({ ...h, displayFinancialStatus: 'REFUNDED' })!.hamDurum.status).toBe('REFUNDED');
  });

  test('vergi dahilse currentTotalTaxSet dusulur', () => {
    const h = hazir(ham('siparis-butika.json'));
    const s = siparisAyristir({ ...h, taxesIncluded: true, totalTaxSet: { shopMoney: { amount: '4.16' } } })!;
    expect(s.tutarMinor).toBe(2495 - 416);
  });

  test('iptalsiz iade: currentTotalTaxSet 0 olsa da ilk vergi (totalTaxSet) dusulur', () => {
    const h = hazir(ham('siparis-iade.json'));
    const s = siparisAyristir({
      ...h,
      taxesIncluded: true,
      totalTaxSet: { shopMoney: { amount: '4.16' } },
      currentTotalTaxSet: { shopMoney: { amount: '0.0' } },
    } as HamShopifySiparis)!;
    expect(s.tutarMinor).toBe(2495 - 416);
  });

  test('siparisAt createdAt alanindan gelir', () => {
    expect(siparisAyristir(hazir(ham('siparis-kargoda.json')))!.siparisAt.toISOString()).toBe('2026-10-24T20:41:14.000Z');
  });

  test('processedAt cok eski olsa da siparisAt degismez (magaza degistirebilir)', () => {
    const h = { ...hazir(ham('siparis-kargoda.json')), processedAt: '2020-01-01T00:00:00Z' } as HamShopifySiparis;
    expect(siparisAyristir(h)!.siparisAt.toISOString()).toBe('2026-10-24T20:41:14.000Z');
  });

  test('kargo firmasi: bilinen alan adlari, bilinmeyen null, adli firma korunur', () => {
    const h = hazir(ham('siparis-butika.json'));
    const kargo = (company: string | null, url: string | null) =>
      siparisAyristir({ ...h, fulfillments: [{ status: 'SUCCESS', displayStatus: 'FULFILLED', trackingInfo: [{ company, number: '1', url }] }] })!.kargoFirmasi;
    expect(kargo('Other', 'https://kargotakip.araskargo.com.tr/x')).toBe('Aras Kargo');
    expect(kargo('Other', 'https://www.mngkargo.com.tr/x')).toBe('MNG Kargo');
    expect(kargo('Other', 'https://gonderitakip.ptt.gov.tr/x')).toBe('PTT Kargo');
    expect(kargo('Other', 'https://www.suratkargo.com.tr/x')).toBe('Sürat Kargo');
    expect(kargo('Other', 'https://www.hepsijet.com/x')).toBe('HepsiJet');
    expect(kargo('Other', 'https://www.trendyolexpress.com/x')).toBe('Trendyol Express');
    expect(kargo('Other', 'https://bilinmeyen.example.com/x')).toBeNull();
    expect(kargo('Other', null)).toBeNull();
    expect(kargo('DHL Express', 'https://dhl.com/x')).toBe('DHL Express');
  });
});

describe('sorgu metni', () => {
  test('musteri, e-posta, telefon, adres, IP alanlari yok', () => {
    // customerJourneySummary (atif) musteri bilgisi degildir.
    const desen = /customer(?!JourneySummary)|email|phone|Address|Ip\b|[a-z]Ip/;
    expect(SIPARIS_ALANLARI).not.toMatch(desen);
    expect(SIPARIS_SORGUSU).not.toMatch(desen);
  });
});

describe('shopifySiparisGetir', () => {
  const ist = (govde: unknown) => {
    const degiskenler: unknown[] = [];
    const fn = (async (_u: unknown, init?: RequestInit) => {
      degiskenler.push(JSON.parse(String(init?.body)).variables);
      return new Response(JSON.stringify(govde), { status: 200 });
    }) as unknown as typeof fetch;
    return {
      degiskenler,
      ist: shopifyIstemci(
        { magaza: 'deneme.myshopify.com', uyg: { clientId: 'a', secret: 'b' }, tokenlar: { erisim: 't', yenileme: null, bitisAt: null } },
        fn,
      ),
    };
  };
  test('siparisi getirir; yoksa null; sayisal kimlik GID olur', async () => {
    const a = ist({ data: { order: ham('siparis-butika.json') } });
    expect((await shopifySiparisGetir(a.ist, '18966027304994'))!.utmSource).toBe('butika');
    expect(a.degiskenler[0]).toEqual({ id: 'gid://shopify/Order/18966027304994' });
    expect(await shopifySiparisGetir(ist({ data: { order: null } }).ist, 'gid://shopify/Order/1')).toBeNull();
  });
});
