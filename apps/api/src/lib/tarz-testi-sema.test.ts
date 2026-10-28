import { describe, expect, test } from 'bun:test';
import {
  KISA_SENARYO,
  PUANLANABILIR_SURUMLER,
  SENARYO_SORULARI,
  TARZLAR,
  TARZ_ACIKLAMALARI,
  TEST_SURUMU_KISA,
  tarzTestiGonderSchema,
} from '@butika/types';

const gecerli = {
  testSurumu: 1,
  senaryo: { kahvalti: ['hepsi', 'keten_elbise'], davet: ['ucusan_cicekli'], ayakkabi: ['babet'] },
  acikTarzlar: ['bohem'],
  fiyatSegmentleri: ['orta'],
  renkler: ['pastel'],
};

describe('tarz testi tanımları', () => {
  test('şık tarzları sözlükte, anahtarlar soru içinde benzersiz', () => {
    for (const soru of SENARYO_SORULARI) {
      const anahtarlar = soru.siklar.map((s) => s.anahtar);
      expect(new Set(anahtarlar).size).toBe(anahtarlar.length);
      for (const s of soru.siklar) {
        if (s.ana) expect(TARZLAR).toContain(s.ana);
        if (s.ikinci) expect(TARZLAR).toContain(s.ikinci);
      }
    }
    expect(Object.keys(TARZ_ACIKLAMALARI).sort()).toEqual([...TARZLAR].sort());
  });

  test('"hepsi" yalnız kahvaltı sorusunda', () => {
    const hepsiOlanlar = SENARYO_SORULARI.filter((s) =>
      s.siklar.some((k) => k.anahtar === 'hepsi'),
    );
    expect(hepsiOlanlar.map((s) => s.anahtar)).toEqual(['kahvalti']);
  });
});

describe('gönderim şeması', () => {
  test('geçerli cevap kabul edilir', () => {
    expect(tarzTestiGonderSchema.safeParse(gecerli).success).toBe(true);
  });
  test('bilinmeyen şık reddedilir', () => {
    const r = tarzTestiGonderSchema.safeParse({
      ...gecerli,
      senaryo: { ...gecerli.senaryo, davet: ['takim_elbise'] },
    });
    expect(r.success).toBe(false);
  });
  test('eksik soru reddedilir', () => {
    const r = tarzTestiGonderSchema.safeParse({
      ...gecerli,
      senaryo: { kahvalti: ['hepsi'], davet: ['siyah_sade'] },
    });
    expect(r.success).toBe(false);
  });
  test('"hepsi" davet sorusunda reddedilir', () => {
    const r = tarzTestiGonderSchema.safeParse({
      ...gecerli,
      senaryo: { ...gecerli.senaryo, davet: ['hepsi'] },
    });
    expect(r.success).toBe(false);
  });
  test('tekrarlı şık, 3ten fazla tarz, 3ten fazla renk reddedilir', () => {
    expect(
      tarzTestiGonderSchema.safeParse({
        ...gecerli,
        senaryo: { ...gecerli.senaryo, ayakkabi: ['babet', 'babet'] },
      }).success,
    ).toBe(false);
    expect(
      tarzTestiGonderSchema.safeParse({
        ...gecerli,
        acikTarzlar: ['bohem', 'romantik', 'minimal', 'cesur'],
      }).success,
    ).toBe(false);
    expect(
      tarzTestiGonderSchema.safeParse({
        ...gecerli,
        renkler: ['pastel', 'koyu', 'canli', 'desenli'],
      }).success,
    ).toBe(false);
  });
  test('fiyat ve renk boş olabilir, tarz boş olamaz', () => {
    expect(
      tarzTestiGonderSchema.safeParse({ ...gecerli, fiyatSegmentleri: [], renkler: [] }).success,
    ).toBe(true);
    expect(tarzTestiGonderSchema.safeParse({ ...gecerli, acikTarzlar: [] }).success).toBe(false);
  });
  test('eski test sürümü reddedilir', () => {
    expect(tarzTestiGonderSchema.safeParse({ ...gecerli, testSurumu: 0 }).success).toBe(false);
  });
});

describe('kısa tarz testi (sürüm 2)', () => {
  const kahvaltiSik = SENARYO_SORULARI.find((s) => s.anahtar === 'kahvalti')?.siklar[0]?.anahtar;
  const kisa = {
    testSurumu: 2,
    senaryo: { kahvalti: [kahvaltiSik] },
    acikTarzlar: ['minimal'],
    fiyatSegmentleri: ['orta'],
    renkler: [],
  };
  test('üç soru dolu kabul edilir', () => {
    expect(tarzTestiGonderSchema.safeParse(kisa).success).toBe(true);
  });
  test('yalnız fiyat cevaplı kabul edilir', () => {
    expect(tarzTestiGonderSchema.safeParse({ ...kisa, senaryo: {}, acikTarzlar: [] }).success).toBe(
      true,
    );
  });
  test('hiç cevap yoksa reddedilir', () => {
    expect(
      tarzTestiGonderSchema.safeParse({
        ...kisa,
        senaryo: {},
        acikTarzlar: [],
        fiyatSegmentleri: [],
      }).success,
    ).toBe(false);
  });
  test('kısa testte davet/ayakkabı ve renk kabul edilmez', () => {
    expect(
      tarzTestiGonderSchema.safeParse({ ...kisa, senaryo: { ...kisa.senaryo, davet: ['x'] } })
        .success,
    ).toBe(false);
    expect(tarzTestiGonderSchema.safeParse({ ...kisa, renkler: ['pastel'] }).success).toBe(false);
  });
  test('bilinmeyen kahvaltı şıkkı reddedilir', () => {
    expect(
      tarzTestiGonderSchema.safeParse({ ...kisa, senaryo: { kahvalti: ['yok_boyle'] } }).success,
    ).toBe(false);
  });
  test('sürüm 1 eskisi gibi doğrulanır', () => {
    expect(tarzTestiGonderSchema.safeParse({ ...kisa, testSurumu: 1 }).success).toBe(false);
  });
  test('sabitler', () => {
    expect(TEST_SURUMU_KISA).toBe(2);
    expect(KISA_SENARYO).toBe('kahvalti');
    expect(PUANLANABILIR_SURUMLER).toEqual([1, 2]);
  });
  test('yaş aralığı: geçerli kabul, geçersiz red, tek başına yeterli', () => {
    expect(tarzTestiGonderSchema.safeParse({ ...kisa, yasAraligi: '25_34' }).success).toBe(true);
    expect(tarzTestiGonderSchema.safeParse({ ...kisa, yasAraligi: '99' }).success).toBe(false);
    expect(
      tarzTestiGonderSchema.safeParse({
        ...kisa,
        senaryo: {},
        acikTarzlar: [],
        fiyatSegmentleri: [],
        yasAraligi: '25_34',
      }).success,
    ).toBe(true);
  });
});
