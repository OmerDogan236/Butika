import { describe, expect, test } from 'bun:test';
import { kazanciTopla, rozetleriHesapla, tarzPuanlari, tarziCikar } from './profil-ozet';

describe('kazanç toplamı', () => {
  test('yalnız gerçek düşüşler sayılır', () => {
    const o = kazanciTopla([
      { previousPriceMinor: 89000, newPriceMinor: 64000, currency: 'TRY' },
      { previousPriceMinor: 52000, newPriceMinor: 47000, currency: 'TRY' },
      { previousPriceMinor: null, newPriceMinor: 30000, currency: 'TRY' }, // ilk gözlem
      { previousPriceMinor: 10000, newPriceMinor: 12000, currency: 'TRY' }, // zam
    ]);
    expect(o).toEqual({ dususAdedi: 2, toplamMinor: 30000, paraBirimi: 'TRY' });
  });

  test('para birimi karışıksa tutar gösterilmez', () => {
    const o = kazanciTopla([
      { previousPriceMinor: 89000, newPriceMinor: 64000, currency: 'TRY' },
      { previousPriceMinor: 9000, newPriceMinor: 6000, currency: 'USD' },
    ]);
    expect(o.dususAdedi).toBe(2);
    expect(o.paraBirimi).toBeNull();
    expect(o.toplamMinor).toBe(0);
  });

  test('düşüş yoksa sıfır', () => {
    expect(kazanciTopla([])).toEqual({ dususAdedi: 0, toplamMinor: 0, paraBirimi: null });
  });
});

describe('tarz çıkarımı', () => {
  const b = (tarz1: string | null, tarz2: string | null = null) => ({ tarz1, tarz2 });

  test('üç dayanaktan azsa tarz verilmez', () => {
    expect(tarziCikar([b('bohem'), b('bohem')])).toEqual({
      birincil: null,
      ikincil: null,
      dayanakAdet: 2,
    });
  });

  test('birincil etiket ikincilden ağır basar', () => {
    const o = tarziCikar([b('bohem'), b('bohem'), b('sade şık', 'bohem'), b('sade şık')]);
    expect(o.birincil).toBe('bohem'); // 2+2+1 = 5, sade şık 2+2 = 4
    expect(o.ikincil).toBe('sade şık');
    expect(o.dayanakAdet).toBe(4);
  });

  test('etiketsiz butikler dayanağa sayılmaz', () => {
    const o = tarziCikar([b(null), b(null), b('minimal'), b('minimal'), b('minimal')]);
    expect(o).toEqual({ birincil: 'minimal', ikincil: null, dayanakAdet: 3 });
  });
});

describe('rozetler', () => {
  test('eşiğe ulaşan kazanılır, kalanı ilerleme gösterir', () => {
    const r = rozetleriHesapla({ kayitliUrun: 12, koleksiyon: 0, yorum: 1, gezilenButik: 4 });
    const bul = (a: string) => r.find((x) => x.anahtar === a);
    expect(bul('ilkKayit')?.kazanildi).toBe(true);
    expect(bul('onKayit')?.kazanildi).toBe(true);
    expect(bul('yirmiBesKayit')).toEqual({
      anahtar: 'yirmiBesKayit',
      kazanildi: false,
      ilerleme: 12,
      hedef: 25,
    });
    expect(bul('ilkKoleksiyon')?.kazanildi).toBe(false);
    expect(bul('ilkYorum')?.kazanildi).toBe(true);
    expect(bul('onButik')?.ilerleme).toBe(4);
  });
});

describe('tarz puanları', () => {
  test('birincil 2, ikincil 1 puan; etiketsiz butik atlanır', () => {
    expect(
      tarzPuanlari([
        { tarz1: 'bohem', tarz2: 'romantik' },
        { tarz1: 'bohem', tarz2: null },
        { tarz1: null, tarz2: null },
      ]),
    ).toEqual({ bohem: 4, romantik: 1 });
  });
});
