import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ikasIstemci } from './ikas-istemci';
import { ikasSiparisGetir, ikasSiparisleriniGetir, siparisAyristir } from './ikas-siparis';

const oku = (ad: string) => JSON.parse(readFileSync(new URL(`./fixtures/${ad}`, import.meta.url), 'utf8'));
const butika = oku('siparis-butika.json');
const dogrudan = oku('siparis-dogrudan.json');
const iptal = oku('siparis-iptal-odenmedi.json');
const ham = (f: any) => f.data.listOrder.data[0];

function sahteIkas(sayfalar: any[][]) {
  const istekler: { query: string; variables: any }[] = [];
  const fn = (async (_url: string, init: RequestInit) => {
    const govde = JSON.parse(String(init.body));
    istekler.push(govde);
    const sayfa = govde.variables.page ?? 1;
    return new Response(JSON.stringify({ data: { listOrder: { count: 0, data: sayfalar[sayfa - 1] ?? [] } } }), { status: 200 });
  }) as unknown as typeof fetch;
  const ist = ikasIstemci(
    {
      magazaAdi: 'dev-x',
      tokenlar: { erisim: 'a', yenileme: 'r', bitisAt: new Date(Date.now() + 3 * 3600_000).toISOString() },
    },
    fn,
  );
  return { ist, istekler };
}

describe('siparisAyristir', () => {
  test('butika etiketli siparis', () => {
    const s = siparisAyristir(ham(butika));
    expect(s.disSiparisId).toBe('093e44dd-f66b-4f96-85b4-9b747eb9f2f4');
    expect(s.siparisNo).toBe('1006');
    expect(s.siparisAt).toEqual(new Date(1792752898562));
    expect(s.utmSource).toBe('butika');
    expect(s.utmContent).toBe('spike1');
    // satirlar 121 - vergi 20.17 = 100.83
    expect(s.tutarMinor).toBe(10083);
    expect(s.currency).toBe('USD');
    expect(s.hamDurum).toEqual({ status: 'CREATED', odeme: 'PAID', paket: 'PARTIALLY_FULFILLED' });
    expect(s.satirlar).toHaveLength(6);
    expect(s.satirlar[0]).toEqual({
      ad: 'Basic Shorts Lilac',
      adet: 1,
      birimFiyatMinor: 1800,
      disUrunId: 'af8f9e7f-a9b7-4c4e-9a48-d7c00e56fa6c',
    });
    expect(s.kargoFirmasi).toBe('Yurtiçi Kargo');
    expect(s.takipNo).toBe('TEST1006');
    expect(s.takipUrl).toContain('TEST1006');
  });

  test('musteri bilgisi ciktiya girmez', () => {
    const json = JSON.stringify([butika, dogrudan, iptal].map((f) => siparisAyristir(ham(f))));
    for (const yasak of [
      'Ayşe', 'Örnek', 'musteri@example.com', '+905550000000', 'Deneme Sk', '203.0.113.10', 'İstanbul',
    ]) {
      expect(json).not.toContain(yasak);
    }
  });

  test('dogrudan siparis: utm yok, kargo bos', () => {
    const s = siparisAyristir(ham(dogrudan));
    expect(s.utmSource).toBeNull();
    expect(s.utmContent).toBeNull();
  });

  test('iptal edilmis, odenmemis siparis: null durumlara dayanikli', () => {
    const s = siparisAyristir(ham(iptal));
    expect(s.hamDurum.status).toBe('CANCELLED');
    expect(s.hamDurum.odeme).toBe('WAITING');
    expect(s.takipNo).toBeNull();
    expect(s.kargoFirmasi).toBeNull();
  });

  test('odeme ve paket durumu null ise odeme bos, paket null', () => {
    const h = structuredClone(ham(dogrudan));
    h.orderPaymentStatus = null;
    h.orderPackageStatus = null;
    const s = siparisAyristir(h);
    expect(s.hamDurum.odeme).toBe('');
    expect(s.hamDurum.paket).toBeNull();
  });
});

describe('siparis cekme', () => {
  test('ikasSiparisleriniGetir: sayfalar, sorguda musteri alani yok', async () => {
    const { ist, istekler } = sahteIkas([[ham(butika), ham(dogrudan)]]);
    const sonuc: any[] = [];
    for await (const s of ikasSiparisleriniGetir(ist, new Date('2026-10-01T00:00:00Z'))) sonuc.push(s);
    expect(sonuc.map((s) => s.siparisNo)).toEqual(['1006', ham(dogrudan).orderNumber]);
    expect(istekler[0]!.query).not.toMatch(/customer|shippingAddress|clientIp|email|phone/);
  });

  test('ikasSiparisGetir: bulunamazsa null', async () => {
    expect(await ikasSiparisGetir(sahteIkas([[ham(butika)]]).ist, 'x')).toMatchObject({ siparisNo: '1006' });
    expect(await ikasSiparisGetir(sahteIkas([[]]).ist, 'x')).toBeNull();
  });
});
