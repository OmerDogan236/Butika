import { describe, expect, test } from 'bun:test';
// Bu dosya saf TypeScript, React Native ice aktarmasi yok — `bun test` calistirabilir.
import { turEn, turTr } from '../i18n/features/tur';
import { type Dikdortgen, TUR_TANIMLARI, gorunurAdimlar, turAcilabilirMi } from './adimlar';

const d: Dikdortgen = { x: 10, y: 20, genislik: 40, yukseklik: 30 };

describe('gorunurAdimlar', () => {
  test('yalnizca olculmus hedeflerin adimlarini dondurur', () => {
    const sonuc = gorunurAdimlar('vitrin', { 'vitrin.sirala': d });
    expect(sonuc.map((a) => a.hedefId)).toEqual(['vitrin.sirala']);
  });

  test('hicbir hedef olculmemisse bos dizi dondurur', () => {
    expect(gorunurAdimlar('vitrin', {})).toEqual([]);
  });

  // Kaydirilmamis Vitrin'de "Butik oner" FAB'i gorunmez (`etkin=false`), yani
  // olculmez → tur 4 degil 3 adimdir ve sayac "1/3" ile baslar.
  test('kaydirilmamis Vitrin ekraninda uc adim gorunur', () => {
    const sonuc = gorunurAdimlar('vitrin', {
      'vitrin.tanitim': d,
      'vitrin.kategoriler': d,
      'vitrin.sirala': d,
    });
    expect(sonuc.map((a) => a.hedefId)).toEqual([
      'vitrin.tanitim',
      'vitrin.kategoriler',
      'vitrin.sirala',
    ]);
  });

  test('adim sirasi TUR_TANIMLARI sirasini korur', () => {
    const hepsi: Record<string, Dikdortgen> = {};
    for (const a of TUR_TANIMLARI.webview) hepsi[a.hedefId] = d;
    const sonuc = gorunurAdimlar('webview', hepsi);
    expect(sonuc.map((a) => a.hedefId)).toEqual(TUR_TANIMLARI.webview.map((a) => a.hedefId));
  });
});

describe('turAcilabilirMi', () => {
  test('gorulmemis ve en az bir hedefi olculmus tur acilir', () => {
    expect(turAcilabilirMi('vitrin', [], { 'vitrin.sirala': d })).toBe(true);
  });

  test('zaten gorulmus tur acilmaz', () => {
    expect(turAcilabilirMi('vitrin', ['vitrin'], { 'vitrin.sirala': d })).toBe(false);
  });

  test('hicbir hedefi olculmemis tur acilmaz', () => {
    expect(turAcilabilirMi('vitrin', [], {})).toBe(false);
  });

  test('gorulenler henuz okunmamissa (null) acilmaz', () => {
    expect(turAcilabilirMi('vitrin', null, { 'vitrin.sirala': d })).toBe(false);
  });
});

describe('TUR_TANIMLARI', () => {
  test('bes tur tanimli', () => {
    expect(Object.keys(TUR_TANIMLARI).sort()).toEqual([
      'butikcan',
      'kayitli',
      'koleksiyon',
      'vitrin',
      'webview',
    ]);
  });

  test('toplam 12 adim var (1.2.4: kapat adimi kalkti)', () => {
    const toplam = Object.values(TUR_TANIMLARI).reduce((s, a) => s + a.length, 0);
    expect(toplam).toBe(12);
  });

  test('vitrin turu dogru sirada dort adim', () => {
    expect(TUR_TANIMLARI.vitrin.map((a) => a.hedefId)).toEqual([
      'vitrin.tanitim',
      'vitrin.kategoriler',
      'vitrin.sirala',
      'vitrin.butikOner',
    ]);
  });

  test('her hedefId benzersiz', () => {
    const hepsi = Object.values(TUR_TANIMLARI)
      .flat()
      .map((a) => a.hedefId);
    expect(new Set(hepsi).size).toBe(hepsi.length);
  });

  // Eksik ceviri anahtari, baloncukta metin yerine ham anahtarin gorunmesi demek.
  test('her adimin TR ve EN metni tanimli', () => {
    const eksik: string[] = [];
    for (const adim of Object.values(TUR_TANIMLARI).flat()) {
      for (const tam of [adim.baslikAnahtari, adim.metinAnahtari]) {
        const anahtar = tam.replace(/^tur\./, '');
        if (!(anahtar in turTr)) eksik.push(`tr:${anahtar}`);
        if (!(anahtar in turEn)) eksik.push(`en:${anahtar}`);
      }
    }
    expect(eksik).toEqual([]);
  });
});
