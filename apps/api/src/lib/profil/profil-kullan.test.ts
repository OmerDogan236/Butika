import { describe, expect, test } from 'bun:test';
import type { ProfilKaynagi } from '@butika/db';
import {
  butikcanProfili,
  etiketIpuclari,
  onerilendeProfilKullanilir,
  profilDolu,
  vitrinProfili,
} from './profil-kullan';

const profil = (kaynak: ProfilKaynagi, ek: Partial<Parameters<typeof vitrinProfili>[0]> = {}) => ({
  kaynak,
  tarz: { minimal: 1, bohem: 0.6, sokak: 0.2 },
  butce: { segmentler: { orta: 1, yuksek: 0.5, uygun: 0.3 }, ortanca: { TRY: 150_000 } },
  kategoriler: { k1: 1 },
  urunEtiketleri: { tur: { gomlek: 1, etek: 0.3 }, renk: { siyah: 1 }, malzeme: { keten: 0.7 } },
  yasAraligi: '25_34',
  ...ek,
});

describe('vitrinProfili', () => {
  test('profil yoksa null (admin sırası)', () => {
    expect(vitrinProfili(null)).toBeNull();
    expect(vitrinProfili(undefined)).toBeNull();
  });
  test('boş profil null', () => expect(vitrinProfili(profil('bos'))).toBeNull());
  test('test, karışık ve yalnız davranış profili sıralama girdisine çevrilir (aşama 3)', () => {
    for (const k of ['test', 'karisik', 'davranis'] as const) {
      expect(vitrinProfili(profil(k))).toEqual({
        tarz: { minimal: 1, bohem: 0.6, sokak: 0.2 },
        butceSegmentleri: { orta: 1, yuksek: 0.5, uygun: 0.3 },
        yasAraligi: '25_34',
        kategoriler: { k1: 1 },
      });
    }
  });
  test('bozuk jsonb alanları boş sayılır, hata vermez', () => {
    const p = profil('test', {
      tarz: null as never,
      butce: null as never,
      kategoriler: undefined as never,
    });
    expect(vitrinProfili(p)).toEqual({
      tarz: {},
      butceSegmentleri: {},
      yasAraligi: '25_34',
      kategoriler: {},
    });
  });
});

describe('etiketIpuclari', () => {
  test('puanı ≥ 0.5 olan en yüksek tür ve malzeme Türkçe kelimelere çevrilir; renk yok', () => {
    expect(
      etiketIpuclari({
        tur: { gomlek: 1, etek: 0.3 },
        renk: { siyah: 1 },
        malzeme: { keten: 0.7 },
      }),
    ).toEqual(['gömlek', 'keten']);
  });
  test('birden çok kelimeli tür', () => {
    expect(etiketIpuclari({ tur: { kaban_mont: 1 }, renk: {}, malzeme: {} })).toEqual([
      'kaban',
      'mont',
    ]);
  });
  test('düşük puan, "diger" ve sözlük dışı değer atlanır', () => {
    expect(etiketIpuclari({ tur: { diger: 1 }, renk: {}, malzeme: { keten: 0.4 } })).toEqual([]);
    expect(etiketIpuclari({ tur: { uzayli: 1 }, renk: {}, malzeme: {} })).toEqual([]);
  });
  test('etiket yoksa boş', () => {
    expect(etiketIpuclari(null as never)).toEqual([]);
    expect(etiketIpuclari({ tur: {}, renk: {}, malzeme: {} })).toEqual([]);
  });
});

describe('butikcanProfili', () => {
  test('ilk iki tarz, puanı ≥ 0.5 olan segmentler ve arama ipuçları', () => {
    expect(butikcanProfili(profil('karisik'))).toEqual({
      tarz1: 'minimal',
      tarz2: 'bohem',
      fiyatSegmentleri: ['orta', 'yuksek'],
      aramaIpuclari: ['gömlek', 'keten'],
    });
  });
  test('yalnız davranıştan gelen profil de kullanılır', () => {
    expect(butikcanProfili(profil('davranis'))?.tarz1).toBe('minimal');
  });
  test('tek tarz varsa tarz2 null', () => {
    expect(butikcanProfili(profil('test', { tarz: { sokak: 1 } }))?.tarz2).toBeNull();
  });
  test('eşit puanda tarz adı sırası (kararlı)', () => {
    const p = butikcanProfili(profil('test', { tarz: { vintage: 1, bohem: 1, cesur: 1 } }));
    expect([p?.tarz1, p?.tarz2]).toEqual(['bohem', 'cesur']);
  });
  test('profil yok, boş ya da tarzı ve bütçesi olmayan profil → null (bugünkü davranış)', () => {
    expect(butikcanProfili(null)).toBeNull();
    expect(butikcanProfili(profil('bos'))).toBeNull();
    expect(
      butikcanProfili(profil('davranis', { tarz: {}, butce: { segmentler: {}, ortanca: {} } })),
    ).toBeNull();
  });
});

describe('profilDolu (GET /me/profil-durumu)', () => {
  test('bos dışındaki profil dolu; profil yoksa değil', () => {
    expect(profilDolu(profil('test'))).toBe(true);
    expect(profilDolu(profil('karisik'))).toBe(true);
    expect(profilDolu(profil('davranis'))).toBe(true);
    expect(profilDolu(profil('bos'))).toBe(false);
    expect(profilDolu(null)).toBe(false);
  });
});

describe('onerilendeProfilKullanilir ("Önerilen" sıralaması)', () => {
  test('yalnız testi olmayan ve profili davranışla dolu kullanıcıda', () => {
    expect(onerilendeProfilKullanilir(profil('davranis'), false)).toBe(true);
  });
  test('testi olan, profili boş/test/karışık olan ya da profili olmayan: admin sırası', () => {
    expect(onerilendeProfilKullanilir(profil('davranis'), true)).toBe(false);
    expect(onerilendeProfilKullanilir(profil('karisik'), false)).toBe(false);
    expect(onerilendeProfilKullanilir(profil('test'), false)).toBe(false);
    expect(onerilendeProfilKullanilir(profil('bos'), false)).toBe(false);
    expect(onerilendeProfilKullanilir(null, false)).toBe(false);
  });
});
