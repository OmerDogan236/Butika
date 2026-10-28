import { describe, expect, test } from 'bun:test';
import { BOS_DETAYLI_CEVAP } from '@butika/types';
import {
  adimDolu,
  adimiBosalt,
  degistir,
  detayliDavetGorunsunMu,
  detayliPencereAcilsinMi,
} from './detayli-test';

describe('detayliDavetGorunsunMu', () => {
  const d = { kisaTestVar: true, detayliVar: false, kapatildi: false };
  test('kısa test var, detaylı yok → görünür', () => expect(detayliDavetGorunsunMu(d)).toBe(true));
  test('kısa test yok → görünmez (eski kart görünür)', () =>
    expect(detayliDavetGorunsunMu({ ...d, kisaTestVar: false })).toBe(false));
  test('detaylı test var → görünmez', () =>
    expect(detayliDavetGorunsunMu({ ...d, detayliVar: true })).toBe(false));
  test('bu açılışta kapatıldı → görünmez', () =>
    expect(detayliDavetGorunsunMu({ ...d, kapatildi: true })).toBe(false));
  test('veri yüklenmedi → görünmez (yanıp sönmesin)', () => {
    expect(detayliDavetGorunsunMu({ ...d, kisaTestVar: undefined })).toBe(false);
    expect(detayliDavetGorunsunMu({ ...d, detayliVar: undefined })).toBe(false);
  });
});

describe('detayliPencereAcilsinMi', () => {
  const hazir = {
    gorunsun: true,
    turAcik: false,
    iskelet: false,
    kisiselAdimBekliyor: false,
    odakta: true,
  };
  test('hepsi uygun → açılır', () => expect(detayliPencereAcilsinMi(hazir)).toBe(true));
  test('görünme kuralı sağlanmıyor → açılmaz', () =>
    expect(detayliPencereAcilsinMi({ ...hazir, gorunsun: false })).toBe(false));
  test('tur açık → açılmaz', () =>
    expect(detayliPencereAcilsinMi({ ...hazir, turAcik: true })).toBe(false));
  test('iskelet yükleniyor → açılmaz', () =>
    expect(detayliPencereAcilsinMi({ ...hazir, iskelet: true })).toBe(false));
  test('kişisel akış açılacak → açılmaz', () =>
    expect(detayliPencereAcilsinMi({ ...hazir, kisiselAdimBekliyor: true })).toBe(false));
  test('vitrin odakta değil → açılmaz', () =>
    expect(detayliPencereAcilsinMi({ ...hazir, odakta: false })).toBe(false));
});

describe('adımlar', () => {
  test('boş cevapta hiçbir adım dolu değil', () => {
    for (const a of ['cocuk', 'durumlar', 'beden'] as const)
      expect(adimDolu(BOS_DETAYLI_CEVAP, a)).toBe(false);
  });
  test('beden adımı yalnız büyük beden kutusuyla da dolu', () =>
    expect(adimDolu({ ...BOS_DETAYLI_CEVAP, buyukBeden: true }, 'beden')).toBe(true));
  test('beden adımı yalnız bir beden seçilince de dolu', () =>
    expect(adimDolu({ ...BOS_DETAYLI_CEVAP, bedenler: ['s'] }, 'beden')).toBe(true));
  test('çocuk "yok" dolu sayılır', () =>
    expect(
      adimDolu(
        { ...BOS_DETAYLI_CEVAP, cocuk: { var: false, yaslar: [], cinsiyet: null } },
        'cocuk',
      ),
    ).toBe(true));
  test('geç → o adımın alanları boşalır, diğerleri kalır', () => {
    const c = {
      ...BOS_DETAYLI_CEVAP,
      bedenler: ['m' as const],
      buyukBeden: true,
      kumas: 'dogal' as const,
    };
    expect(adimiBosalt(c, 'beden')).toEqual({ ...BOS_DETAYLI_CEVAP, kumas: 'dogal' });
  });
  test('degistir sınırı aşmaz, ikinci dokunuş kaldırır', () => {
    expect(degistir(['a', 'b'], 'c', 2)).toEqual(['a', 'b']);
    expect(degistir(['a', 'b'], 'a', 2)).toEqual(['b']);
  });
});
