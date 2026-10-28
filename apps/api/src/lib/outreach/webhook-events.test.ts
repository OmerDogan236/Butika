import { describe, expect, test } from 'bun:test';
import { durumIlerletilmeli, olayEslesmesi, olayZamani } from './webhook-events';

describe('olayEslesmesi — Brevo guncel olay adlari', () => {
  test('temel olaylar taninir', () => {
    expect(olayEslesmesi('delivered')?.durum).toBe('ulasti');
    expect(olayEslesmesi('unique_opened')?.durum).toBe('acildi');
    expect(olayEslesmesi('click')?.durum).toBe('tiklandi');
    expect(olayEslesmesi('hard_bounce')?.durum).toBe('geri_dondu');
    expect(olayEslesmesi('blocked')?.durum).toBe('engellendi');
    expect(olayEslesmesi('unsubscribed')?.durum).toBe('listeden_cikti');
  });

  test('spam sikayeti engellendi sayilir', () => {
    expect(olayEslesmesi('spam')?.durum).toBe('engellendi');
  });

  test('gecersiz adres geri donus sayilir', () => {
    expect(olayEslesmesi('invalid_email')?.durum).toBe('geri_dondu');
  });

  test('buyuk harf ve bosluk sorun olmaz', () => {
    expect(olayEslesmesi(' Delivered ')?.durum).toBe('ulasti');
  });

  test('bilinmeyen olay null doner — veri bozulmaz', () => {
    expect(olayEslesmesi('bilinmeyen_olay')).toBeNull();
  });

  test('her olay dogru zaman alanini doldurur', () => {
    expect(olayEslesmesi('delivered')?.alan).toBe('deliveredAt');
    expect(olayEslesmesi('click')?.alan).toBe('clickedAt');
    expect(olayEslesmesi('deferred')?.alan).toBeNull();
  });
});

describe('durumIlerletilmeli — sirasiz olaylar veriyi bozmamali', () => {
  test('ileri giden olay kabul edilir', () => {
    expect(durumIlerletilmeli('gonderildi', 'ulasti')).toBe(true);
    expect(durumIlerletilmeli('ulasti', 'acildi')).toBe(true);
  });

  test('gec gelen eski olay durumu GERI ALMAZ', () => {
    expect(durumIlerletilmeli('acildi', 'ulasti')).toBe(false);
    expect(durumIlerletilmeli('tiklandi', 'acildi')).toBe(false);
  });

  test('ayni olay tekrar gelirse degisiklik olmaz (idempotent)', () => {
    expect(durumIlerletilmeli('ulasti', 'ulasti')).toBe(false);
  });

  test('geri donus ve engellenme her durumu ezer', () => {
    expect(durumIlerletilmeli('tiklandi', 'geri_dondu')).toBe(true);
    expect(durumIlerletilmeli('acildi', 'engellendi')).toBe(true);
  });

  test('listeden cikma en son durumdur', () => {
    expect(durumIlerletilmeli('geri_dondu', 'listeden_cikti')).toBe(true);
  });
});

describe('olayZamani', () => {
  test('ts_event saniyesi kullanilir', () => {
    expect(olayZamani({ ts_event: 1_700_000_000 }).getTime()).toBe(1_700_000_000_000);
  });

  test('ts yedek olarak kullanilir', () => {
    expect(olayZamani({ ts: 1_700_000_000 }).getTime()).toBe(1_700_000_000_000);
  });

  test('yalniz tarih metni varsa o okunur', () => {
    expect(olayZamani({ date: '2026-09-19 12:00:00' }).getFullYear()).toBe(2026);
  });

  test('hicbiri yoksa cokmeden simdiki zaman doner', () => {
    expect(olayZamani({}).getTime()).toBeGreaterThan(0);
  });
});
