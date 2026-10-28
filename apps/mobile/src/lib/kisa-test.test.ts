import { describe, expect, test } from 'bun:test';
import { atlananAdimSayisi, bosCevap, gonderimdenAtlanan, gonderimeCevir } from './kisa-test';

describe('kısa test', () => {
  test('boş cevap: yaş dahil her şey boş', () => {
    expect(bosCevap()).toEqual({
      kahvalti: [],
      acikTarzlar: [],
      fiyatSegmentleri: [],
      yasAraligi: null,
    });
  });

  test('hepsi boşsa gönderilmez', () => expect(gonderimeCevir(bosCevap())).toBeNull());

  test('dolu cevap sürüm 2 gönderimine çevrilir', () => {
    expect(
      gonderimeCevir({
        kahvalti: ['k1'],
        acikTarzlar: ['minimal'],
        fiyatSegmentleri: ['orta'],
        yasAraligi: '25_34',
      }),
    ).toEqual({
      testSurumu: 2,
      senaryo: { kahvalti: ['k1'] },
      acikTarzlar: ['minimal'],
      fiyatSegmentleri: ['orta'],
      renkler: [],
      yasAraligi: '25_34',
    });
  });

  test('boş kahvaltı senaryoya konmaz, atlanan yaş null gider', () => {
    const g = gonderimeCevir({
      kahvalti: [],
      acikTarzlar: ['bohem'],
      fiyatSegmentleri: [],
      yasAraligi: null,
    });
    expect(g?.senaryo).toEqual({});
    expect(g && 'yasAraligi' in g ? g.yasAraligi : 'yok').toBeNull();
  });

  test('yalnız yaş dolu da gönderilir', () => {
    const g = gonderimeCevir({ ...bosCevap(), yasAraligi: '55_plus' });
    expect(g).not.toBeNull();
    expect(atlananAdimSayisi({ ...bosCevap(), yasAraligi: '55_plus' })).toBe(3);
  });

  test('atlanan adım sayısı 4 adım üzerinden', () => {
    expect(atlananAdimSayisi(bosCevap())).toBe(4);
    expect(
      atlananAdimSayisi({
        kahvalti: [],
        acikTarzlar: ['bohem'],
        fiyatSegmentleri: [],
        yasAraligi: null,
      }),
    ).toBe(3);
    expect(
      atlananAdimSayisi({
        kahvalti: ['k1'],
        acikTarzlar: ['bohem'],
        fiyatSegmentleri: ['uygun'],
        yasAraligi: '18_24',
      }),
    ).toBe(0);
  });
});

describe('gonderimdenAtlanan (bekleyen cevap ölçümü)', () => {
  test('gönderimden atlanan adım sayısı geri bulunur', () => {
    const c = { ...bosCevap(), acikTarzlar: ['minimal' as const] };
    const g = gonderimeCevir(c);
    if (!g) throw new Error('gönderim bekleniyordu');
    expect(gonderimdenAtlanan(g)).toBe(atlananAdimSayisi(c));
    expect(gonderimdenAtlanan(g)).toBe(3);
  });
  test('tam test (sürüm 1) için 0', () => {
    expect(
      gonderimdenAtlanan({
        testSurumu: 1,
        senaryo: {},
        acikTarzlar: [],
        fiyatSegmentleri: [],
        renkler: [],
      } as never),
    ).toBe(0);
  });
});
