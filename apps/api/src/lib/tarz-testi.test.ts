import { describe, expect, test } from 'bun:test';
import { kayittanTestPuanlari, testSonucunuHesapla } from './tarz-testi';

describe('tarz testi sonucu', () => {
  test('tek şıklı cevaplar: ana 2, ikinci 1, açık seçim 3', () => {
    const s = testSonucunuHesapla({
      senaryo: {
        kahvalti: ['keten_elbise'],
        davet: ['ucusan_cicekli'],
        ayakkabi: ['espadril_sandalet'],
      },
      acikTarzlar: ['bohem'],
    });
    expect(s.puanlar.bohem).toBe(8);
    expect(s.puanlar.romantik).toBe(3);
    expect([s.tarz1, s.tarz2]).toEqual(['bohem', 'romantik']);
    expect([s.senaryoTarz1, s.senaryoTarz2]).toEqual(['bohem', 'romantik']);
    expect(s.esnek).toBe(false);
  });

  test('çoklu seçimde puan bölünür, beraberlikte açıkça seçilen öne geçer', () => {
    const s = testSonucunuHesapla({
      senaryo: {
        kahvalti: ['beyaz_tisort', 'kot_sweatshirt'],
        davet: ['siyah_sade'],
        ayakkabi: ['loafer'],
      },
      acikTarzlar: ['günlük'],
    });
    expect(s.puanlar.minimal).toBeCloseTo(4);
    expect(s.puanlar.günlük).toBeCloseTo(4);
    expect(s.puanlar['sade şık']).toBeCloseTo(3.5);
    expect([s.tarz1, s.tarz2]).toEqual(['günlük', 'minimal']);
    expect([s.senaryoTarz1, s.senaryoTarz2]).toEqual(['minimal', 'sade şık']);
  });

  test('yalnız "hepsi": soru puan vermez, esnek işaretlenir, senaryo beraberliği sözlük sırasıyla', () => {
    const s = testSonucunuHesapla({
      senaryo: { kahvalti: ['hepsi'], davet: ['dikkat_ceken'], ayakkabi: ['sneaker'] },
      acikTarzlar: ['cesur'],
    });
    expect(s.esnek).toBe(true);
    expect(s.puanlar.cesur).toBe(5);
    expect(s.puanlar.sokak).toBe(2);
    expect([s.tarz1, s.tarz2]).toEqual(['cesur', 'sokak']);
    expect([s.senaryoTarz1, s.senaryoTarz2]).toEqual(['sokak', 'cesur']);
  });

  test('"hepsi" + şık: şık yarım puanla sayılır', () => {
    const s = testSonucunuHesapla({
      senaryo: {
        kahvalti: ['hepsi', 'anne_ceketi'],
        davet: ['donem_esintili'],
        ayakkabi: ['babet'],
      },
      acikTarzlar: ['vintage'],
    });
    expect(s.esnek).toBe(true);
    expect(s.puanlar.vintage).toBe(7);
    expect(s.puanlar.romantik).toBe(2);
  });

  test('tek tarz puan aldıysa tarz2 null', () => {
    const s = testSonucunuHesapla({
      senaryo: {
        kahvalti: ['goz_alici_renk'],
        davet: ['dikkat_ceken'],
        ayakkabi: ['iddiali_bot_topuklu'],
      },
      acikTarzlar: ['cesur'],
    });
    expect([s.tarz1, s.tarz2]).toEqual(['cesur', null]);
  });
});

describe('kayıttaki cevaptan tarz puanları', () => {
  test('puanlanabilir sürümde senaryo ve açık seçimden hesaplanır', () => {
    const p = kayittanTestPuanlari({
      testSurumu: 2,
      senaryoCevaplari: {
        kahvalti: ['keten_elbise'],
        davet: ['ucusan_cicekli'],
        ayakkabi: ['espadril_sandalet'],
      },
      acikTarzlar: ['bohem'],
      tarz1: 'minimal',
      tarz2: null,
    });
    expect(p.bohem).toBe(8);
    expect(p.romantik).toBe(3);
    expect(p.minimal).toBeUndefined();
  });

  test('eski sürümde yalnız sonuç etiketleri: tarz1 2, tarz2 1', () => {
    expect(
      kayittanTestPuanlari({
        testSurumu: 0,
        senaryoCevaplari: {},
        acikTarzlar: [],
        tarz1: 'minimal',
        tarz2: 'klasik',
      }),
    ).toEqual({ minimal: 2, klasik: 1 });
  });
});
