import { describe, expect, test } from 'bun:test';
import type { BulguTuru } from './siniflandir';
import { karsilastir } from './karsilastir';

const ozet = { kokAlanAdi: 'x.com', paraBirimi: 'TRY', baslik: 'X', acildi: true };
const acilmadi = { ...ozet, acildi: false };
const bos = new Map<BulguTuru, string | null>();
const onceki0 = {
  sonAlanAdi: 'x.com',
  sonParaBirimi: 'TRY',
  sonBaslik: 'X',
  ardisikAcilmama: 0,
  yoksay: {},
};

describe('karsilastir', () => {
  test('ilk hafta açılmıyor orta, ikinci hafta yüksek', () => {
    const h = [{ tur: 'acilmiyor' as const, kanit: 'ENOTFOUND', deger: 'ENOTFOUND' }];
    const bir = karsilastir(null, h, acilmadi, bos);
    expect(bir.bulgular[0]).toMatchObject({ tur: 'acilmiyor', onem: 'orta' });
    expect(bir.yeniDurum.ardisikAcilmama).toBe(1);
    const iki = karsilastir(
      { ...bir.yeniDurum },
      h,
      acilmadi,
      new Map<BulguTuru, string | null>([['acilmiyor', 'ENOTFOUND']]),
    );
    expect(iki.bulgular[0]).toMatchObject({ onem: 'yuksek', yeni: false });
  });
  test('açılınca sayaç sıfırlanır', () => {
    expect(
      karsilastir({ ...onceki0, ardisikAcilmama: 2 }, [], ozet, bos).yeniDurum.ardisikAcilmama,
    ).toBe(0);
  });
  test('önceki haftada olmayan bulgu yeni', () => {
    const r = karsilastir(
      onceki0,
      [{ tur: 'para_birimi', kanit: 'EUR', deger: 'EUR' }],
      { ...ozet, paraBirimi: 'EUR' },
      bos,
    );
    expect(r.bulgular[0]).toMatchObject({
      tur: 'para_birimi',
      yeni: true,
      oncekiDeger: 'TRY',
      simdikiDeger: 'EUR',
    });
  });
  test('yoksay aynı değerde gizler, değer değişince getirir', () => {
    const onceki = { ...onceki0, sonParaBirimi: 'EUR', yoksay: { para_birimi: 'EUR' } };
    expect(
      karsilastir(
        onceki,
        [{ tur: 'para_birimi', kanit: 'EUR', deger: 'EUR' }],
        { ...ozet, paraBirimi: 'EUR' },
        bos,
      ).bulgular,
    ).toEqual([]);
    expect(
      karsilastir(
        onceki,
        [{ tur: 'para_birimi', kanit: 'USD', deger: 'USD' }],
        { ...ozet, paraBirimi: 'USD' },
        bos,
      ).bulgular,
    ).toHaveLength(1);
  });
  test('değeri boş bulgu (park_satilik) yoksay "" ile gizlenir', () => {
    const h = [{ tur: 'park_satilik' as const, kanit: 'satılık alan adı', deger: '' }];
    const onceki = { ...onceki0, yoksay: { park_satilik: '' } };
    expect(karsilastir(onceki, h, ozet, bos).bulgular).toEqual([]);
    expect(karsilastir(onceki0, h, ozet, bos).bulgular).toHaveLength(1);
  });
  test('marka_uyusmuyor: og:site_name ≠ başlık iken kayıtlı başlıkla yoksayılır, değişince döner', () => {
    const h = [{ tur: 'marka_uyusmuyor' as const, kanit: 'Başka Ad', deger: 'Başka Ad' }];
    const onceki = { ...onceki0, yoksay: { marka_uyusmuyor: 'Sayfa Başlığı' } };
    const o = { ...ozet, baslik: 'Sayfa Başlığı' };
    expect(karsilastir(onceki, h, o, bos).bulgular).toEqual([]);
    expect(karsilastir(onceki, h, { ...ozet, baslik: 'Yeni Başlık' }, bos).bulgular).toHaveLength(
      1,
    );
  });
  test('açılamayan sitede son değerler korunur', () => {
    const r = karsilastir(
      onceki0,
      [{ tur: 'acilmiyor', kanit: 'e', deger: 'e' }],
      { kokAlanAdi: null, paraBirimi: null, baslik: null, acildi: false },
      bos,
    );
    expect(r.yeniDurum).toMatchObject({
      sonAlanAdi: 'x.com',
      sonParaBirimi: 'TRY',
      sonBaslik: 'X',
    });
  });
  test('zaman aşımı (elle_bak, null özet) değerleri ve sayacı korur', () => {
    const r = karsilastir(
      { ...onceki0, ardisikAcilmama: 1 },
      [{ tur: 'elle_bak', kanit: 'Zaman aşımı', deger: '' }],
      { kokAlanAdi: null, paraBirimi: null, baslik: null, acildi: true },
      bos,
    );
    expect(r.yeniDurum).toMatchObject({
      sonAlanAdi: 'x.com',
      sonParaBirimi: 'TRY',
      sonBaslik: 'X',
      ardisikAcilmama: 1,
    });
    expect(r.bulgular[0]).toMatchObject({ tur: 'elle_bak', onem: 'bilgi' });
  });
  test('zaman aşımı (siniflandir: acildi=false, özet b.url alan adı) değerleri ve sayacı korur', () => {
    const r = karsilastir(
      { ...onceki0, sonAlanAdi: 'yeni.com', ardisikAcilmama: 1 },
      [{ tur: 'elle_bak', kanit: 'Zaman aşımı: timeout', deger: '' }],
      { kokAlanAdi: 'x.com', paraBirimi: null, baslik: null, acildi: false },
      bos,
    );
    expect(r.yeniDurum).toMatchObject({
      sonAlanAdi: 'yeni.com',
      sonParaBirimi: 'TRY',
      sonBaslik: 'X',
      ardisikAcilmama: 1,
    });
  });
  test('bağlantı reddi (acilmiyor, acildi=false) sayacı artırır, değerleri korur', () => {
    const r = karsilastir(
      { ...onceki0, sonAlanAdi: 'yeni.com', ardisikAcilmama: 1 },
      [{ tur: 'acilmiyor', kanit: 'ECONNREFUSED', deger: '' }],
      { kokAlanAdi: 'x.com', paraBirimi: null, baslik: null, acildi: false },
      bos,
    );
    expect(r.yeniDurum).toMatchObject({ sonAlanAdi: 'yeni.com', ardisikAcilmama: 2 });
  });
  test('bot koruması sayacı değiştirmez', () => {
    const r = karsilastir(
      { ...onceki0, ardisikAcilmama: 1 },
      [{ tur: 'elle_bak', kanit: 'Bot koruması (HTTP 403)', deger: '' }],
      { ...ozet, baslik: null },
      bos,
    );
    expect(r.yeniDurum.ardisikAcilmama).toBe(1);
    expect(r.yeniDurum.sonBaslik).toBe('X');
  });
  test('ilk kayıtta ve önceki değer yokken özet değerleri alınır', () => {
    const r = karsilastir(null, [], ozet, bos);
    expect(r.yeniDurum).toEqual({
      sonAlanAdi: 'x.com',
      sonParaBirimi: 'TRY',
      sonBaslik: 'X',
      ardisikAcilmama: 0,
      yoksay: {},
    });
  });
  test('degisen deger yeni, ayni deger yeni degil', () => {
    const h = [{ tur: 'para_birimi' as const, kanit: 'k', deger: 'USD' }];
    const o = { ...ozet, paraBirimi: 'USD' };
    const gecen = new Map<BulguTuru, string | null>([['para_birimi', 'EUR']]);
    expect(karsilastir(onceki0, h, o, gecen).bulgular[0]?.yeni).toBe(true);
    const ayni = new Map<BulguTuru, string | null>([['para_birimi', 'USD']]);
    expect(karsilastir(onceki0, h, o, ayni).bulgular[0]?.yeni).toBe(false);
  });
  test('magaza_kapali ve park_satilik sayaci degistirmez', () => {
    for (const tur of ['magaza_kapali', 'park_satilik'] as const) {
      const r = karsilastir(
        { ...onceki0, ardisikAcilmama: 1 },
        [{ tur, kanit: 'k', deger: '' }],
        acilmadi,
        bos,
      );
      expect(r.yeniDurum.ardisikAcilmama).toBe(1);
      expect(r.bulgular[0]?.simdikiDeger).toBeNull();
    }
  });
});
