import { describe, expect, test } from 'bun:test';
import { BOS_DETAYLI_CEVAP } from '@butika/types';
import { detayliTestRaporu, raporDegerleri } from './detayli-test-rapor';

const olay = (userId: string, eylem: string) => ({
  userId,
  type: 'detayli_davet',
  payload: { eylem },
  createdAt: new Date(),
});

describe('raporDegerleri', () => {
  test('çocuk: yok / yaşlar / yaşsız var', () => {
    expect(
      raporDegerleri('cocuk', {
        ...BOS_DETAYLI_CEVAP,
        cocuk: { var: false, yaslar: [], cinsiyet: null },
      }),
    ).toEqual(['yok']);
    expect(
      raporDegerleri('cocuk', {
        ...BOS_DETAYLI_CEVAP,
        cocuk: { var: true, yaslar: ['3_6', '7_12'], cinsiyet: null },
      }),
    ).toEqual(['3_6', '7_12']);
    expect(
      raporDegerleri('cocuk', {
        ...BOS_DETAYLI_CEVAP,
        cocuk: { var: true, yaslar: [], cinsiyet: 'kiz' },
      }),
    ).toEqual(['var']);
  });
  test('beden + büyük beden', () =>
    expect(
      raporDegerleri('beden', { ...BOS_DETAYLI_CEVAP, bedenler: ['m', 'l'], buyukBeden: true }),
    ).toEqual(['m', 'l', 'buyuk_beden']));
  test('geçilen soru boş', () => expect(raporDegerleri('tesettur', BOS_DETAYLI_CEVAP)).toEqual([]));
});

describe('detayliTestRaporu', () => {
  test('kişi sayıları, davet ve küçük grup kuralı', () => {
    const cevaplar = Array.from({ length: 5 }, (_, i) => ({
      ...BOS_DETAYLI_CEVAP,
      tesettur: i < 2 ? 'evet' : 'hayir',
    }));
    const r = detayliTestRaporu(
      [...cevaplar, { bozuk: true }],
      [
        olay('u1', 'gorundu'),
        olay('u1', 'gorundu'),
        olay('u1', 'tiklandi'),
        olay('u2', 'gorundu'),
        olay('u2', 'kapatildi'),
      ],
    );
    expect(r.dolduran).toBe(5); // bozuk kayıt sayılmaz
    expect(r.davet).toEqual({
      goren: 2,
      tiklayan: 1,
      kapatan: 1,
      tiklamaOrani: null,
      kapatmaOrani: null,
    }); // 2 < 5
    const tesettur = r.sorular.find((s) => s.adim === 'tesettur');
    expect(tesettur?.dagilim.map((o) => [o.anahtar, o.adet, o.oran])).toEqual([
      ['hayir', 3, 60],
      ['evet', 2, 40],
    ]);
  });
  test('5 kişiden azsa hiçbir sorunun dağılımı verilmez', () => {
    const cevaplar = Array.from({ length: 4 }, () => ({ ...BOS_DETAYLI_CEVAP, tesettur: 'evet' }));
    const r = detayliTestRaporu(cevaplar, []);
    expect(r.dolduran).toBe(4);
    expect(r.sorular.length).toBeGreaterThan(0);
    for (const s of r.sorular) expect(s.dagilim).toEqual([]);
  });
});
