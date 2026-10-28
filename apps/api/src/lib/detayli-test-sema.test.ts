import { describe, expect, test } from 'bun:test';
import {
  BOS_DETAYLI_CEVAP,
  DETAYLI_TEST_SURUMU,
  detayliEtiket,
  detayliTestGonderSchema,
} from '@butika/types';

const gonder = (cevaplar: unknown) =>
  detayliTestGonderSchema.safeParse({ testSurumu: DETAYLI_TEST_SURUMU, cevaplar });

const dolu = {
  cocuk: { var: true, yaslar: ['0_2', '3_6'], cinsiyet: 'kiz' },
  tesettur: 'evet',
  hamile: 'hayir',
  durumlar: ['davet', 'tatil'],
  urunler: ['abiye', 'mayo'],
  bedenler: ['m', 'l'],
  buyukBeden: true,
  renkler: ['pastel'],
  kumas: 'dogal',
  degerler: ['yerli'],
};

describe('detayliTestGonderSchema', () => {
  test('dolu cevap geçerli', () => expect(gonder(dolu).success).toBe(true));
  test('hepsi geçilmiş cevap geçerli', () => expect(gonder(BOS_DETAYLI_CEVAP).success).toBe(true));
  test('iki bedenli cevap geçerli', () =>
    expect(gonder({ ...dolu, bedenler: ['s', 'm'] }).success).toBe(true));
  test('bedenler en çok 3', () =>
    expect(gonder({ ...dolu, bedenler: ['xs', 's', 'm', 'l'] }).success).toBe(false));
  test('bilinmeyen şık reddedilir', () =>
    expect(gonder({ ...dolu, tesettur: 'belki' }).success).toBe(false));
  test('bilinmeyen alan reddedilir', () =>
    expect(gonder({ ...dolu, ad: 'Ayşe' }).success).toBe(false));
  test('durumlar en çok 3', () =>
    expect(gonder({ ...dolu, durumlar: ['gunluk', 'is', 'davet', 'spor'] }).success).toBe(false));
  test('renkler en çok 2', () =>
    expect(gonder({ ...dolu, renkler: ['notr', 'siyah', 'pastel'] }).success).toBe(false));
  test('tekrarlı seçim reddedilir', () =>
    expect(gonder({ ...dolu, urunler: ['abiye', 'abiye'] }).success).toBe(false));
  test('çocuk yok + yaş dolu reddedilir', () =>
    expect(
      gonder({ ...dolu, cocuk: { var: false, yaslar: ['3_6'], cinsiyet: null } }).success,
    ).toBe(false));
  test('çocuk var, yaş seçilmemiş geçerli', () =>
    expect(gonder({ ...dolu, cocuk: { var: true, yaslar: [], cinsiyet: null } }).success).toBe(
      true,
    ));
  test('yanlış sürüm reddedilir', () =>
    expect(detayliTestGonderSchema.safeParse({ testSurumu: 99, cevaplar: dolu }).success).toBe(
      false,
    ));
});

describe('detayliEtiket', () => {
  test('bilinen anahtar', () => expect(detayliEtiket('tesettur', 'hayir')).toBe('Hayır'));
  test('rapor anahtarları', () => {
    expect(detayliEtiket('cocuk', 'yok')).toBe('Çocuğu yok');
    expect(detayliEtiket('beden', 'buyuk_beden')).toBe('Büyük beden butiklerini de görmek isterim');
  });
  test('bilinmeyen anahtar kendisi döner', () => expect(detayliEtiket('kumas', 'x')).toBe('x'));
});
