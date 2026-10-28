import { describe, expect, test } from 'bun:test';
import {
  BOS_ESIGI,
  PROFIL_AGIRLIK,
  type ProfilButigi,
  type ProfilGirdileri,
  type ProfilKaydi,
  azalma,
  davranisPayi,
  hamDavranis,
  profilHesapla,
} from './profil-hesapla';

const SIMDI = new Date('2026-10-22T00:00:00Z');
const GUN = 24 * 60 * 60 * 1000;
const gunOnce = (g: number) => new Date(SIMDI.getTime() - g * GUN);

const butik = (ek: Partial<ProfilButigi> = {}): ProfilButigi => ({
  tarz1: 'minimal',
  tarz2: null,
  fiyatSegmenti: null,
  kategoriIdleri: [],
  pazarParaBirimi: 'TRY',
  ...ek,
});

const kayit = (ek: Partial<ProfilKaydi> = {}): ProfilKaydi => ({
  butik: butik(),
  kaydedildi: SIMDI,
  satinAlindi: null,
  fiyat: null,
  etiket: { tur: null, renk: null, malzeme: null },
  ...ek,
});

const bos = (): ProfilGirdileri => ({
  test: null,
  kayitlar: [],
  favoriler: [],
  butikAcmalari: [],
  kayitSilmeleri: [],
});

describe('hareket ağırlıkları', () => {
  test('sabitler spec ile aynı: 3 / 2 / 1.5 / 0.3 / −1', () => {
    expect(PROFIL_AGIRLIK).toEqual({
      satinAlma: 3,
      kayit: 2,
      favori: 1.5,
      butikAcma: 0.3,
      kayitSilme: -1,
    });
  });

  test('ürün kaydı 2', () => {
    const h = hamDavranis({ ...bos(), kayitlar: [kayit()] }, SIMDI);
    expect(h.tarz.minimal).toBeCloseTo(2);
  });

  test('satın alma kaydın üstüne 3 ekler (kayıt 2 + satın alma 3)', () => {
    const h = hamDavranis({ ...bos(), kayitlar: [kayit({ satinAlindi: SIMDI })] }, SIMDI);
    expect(h.tarz.minimal).toBeCloseTo(5);
  });

  test('favori 1.5', () => {
    const h = hamDavranis({ ...bos(), favoriler: [{ butik: butik(), zaman: SIMDI }] }, SIMDI);
    expect(h.tarz.minimal).toBeCloseTo(1.5);
  });

  test('butik açma 0.3', () => {
    const h = hamDavranis({ ...bos(), butikAcmalari: [{ butik: butik(), zaman: SIMDI }] }, SIMDI);
    expect(h.tarz.minimal).toBeCloseTo(0.3);
  });

  test('kayıt silme −1', () => {
    const h = hamDavranis(
      {
        ...bos(),
        kayitlar: [kayit()],
        kayitSilmeleri: [{ butik: butik(), zaman: SIMDI }],
      },
      SIMDI,
    );
    expect(h.tarz.minimal).toBeCloseTo(1);
  });

  test('tarz1 tam, tarz2 yarım ağırlıkla', () => {
    const h = hamDavranis(
      { ...bos(), kayitlar: [kayit({ butik: butik({ tarz1: 'bohem', tarz2: 'romantik' }) })] },
      SIMDI,
    );
    expect(h.tarz.bohem).toBeCloseTo(2);
    expect(h.tarz.romantik).toBeCloseTo(1);
  });

  test('tarzı olmayan butik tarza bir şey katmaz', () => {
    const h = hamDavranis(
      { ...bos(), kayitlar: [kayit({ butik: butik({ tarz1: null }) })] },
      SIMDI,
    );
    expect(h.tarz).toEqual({});
  });
});

describe('zamanla azalma', () => {
  test('90 günde yarıya, 180 günde dörtte bire iner', () => {
    expect(azalma(SIMDI, SIMDI)).toBe(1);
    expect(azalma(gunOnce(90), SIMDI)).toBeCloseTo(0.5);
    expect(azalma(gunOnce(180), SIMDI)).toBeCloseTo(0.25);
    expect(azalma(gunOnce(45), SIMDI)).toBeCloseTo(Math.SQRT1_2);
  });

  test('gelecekteki zaman 1 sayılır', () => {
    expect(azalma(new Date(SIMDI.getTime() + 10 * GUN), SIMDI)).toBe(1);
  });

  test('her hareket kendi tarihine göre azalır', () => {
    const h = hamDavranis(
      {
        ...bos(),
        kayitlar: [kayit({ kaydedildi: gunOnce(180), satinAlindi: gunOnce(90) })],
        butikAcmalari: [{ butik: butik(), zaman: gunOnce(90) }],
      },
      SIMDI,
    );
    // 2 × 0.25 + 3 × 0.5 + 0.3 × 0.5
    expect(h.tarz.minimal).toBeCloseTo(0.5 + 1.5 + 0.15);
  });
});

describe('test ve davranış payı', () => {
  test('davranisPayi = min(0.6, kayitSayisi / 10 × 0.6)', () => {
    expect(davranisPayi(0)).toBe(0);
    expect(davranisPayi(1)).toBeCloseTo(0.06);
    expect(davranisPayi(5)).toBeCloseTo(0.3);
    expect(davranisPayi(10)).toBeCloseTo(0.6);
    expect(davranisPayi(40)).toBeCloseTo(0.6);
  });

  test('kayitSayisi kayıt + satın alma + favori; butik açma ve silme sayılmaz', () => {
    const p = profilHesapla(
      {
        ...bos(),
        kayitlar: [kayit(), kayit({ satinAlindi: SIMDI })],
        favoriler: [{ butik: butik(), zaman: SIMDI }],
        butikAcmalari: Array.from({ length: 20 }, () => ({ butik: butik(), zaman: SIMDI })),
        kayitSilmeleri: [{ butik: butik({ tarz1: 'cesur' }), zaman: SIMDI }],
      },
      SIMDI,
    );
    expect(p.kayitSayisi).toBe(4);
  });

  test('test ve davranış birlikte: karışık, oranla karışır', () => {
    // 5 kayıt → pay 0.3. Test: minimal 1 (ölçekli). Davranış: bohem 1 (ölçekli).
    const p = profilHesapla(
      {
        ...bos(),
        test: { tarzPuanlari: { minimal: 4 }, fiyatSegmentleri: [], yasAraligi: null },
        kayitlar: Array.from({ length: 5 }, () => kayit({ butik: butik({ tarz1: 'bohem' }) })),
      },
      SIMDI,
    );
    expect(p.kaynak).toBe('karisik');
    expect(p.tarz.minimal).toBeCloseTo(0.7);
    expect(p.tarz.bohem).toBeCloseTo(0.3);
  });

  test('test varken davranış payı 0.6 ile sınırlı', () => {
    const p = profilHesapla(
      {
        ...bos(),
        test: { tarzPuanlari: { minimal: 1 }, fiyatSegmentleri: [], yasAraligi: null },
        kayitlar: Array.from({ length: 30 }, () => kayit({ butik: butik({ tarz1: 'bohem' }) })),
      },
      SIMDI,
    );
    expect(p.tarz.minimal).toBeCloseTo(0.4);
    expect(p.tarz.bohem).toBeCloseTo(0.6);
  });

  test('test var, davranış yok: yalnız test (kaynak test)', () => {
    const p = profilHesapla(
      {
        ...bos(),
        test: {
          tarzPuanlari: { minimal: 4, klasik: 2 },
          fiyatSegmentleri: ['orta'],
          yasAraligi: '25_34',
        },
        butikAcmalari: [{ butik: butik({ tarz1: 'cesur' }), zaman: SIMDI }],
      },
      SIMDI,
    );
    expect(p.kaynak).toBe('test');
    expect(p.tarz).toEqual({ minimal: 1, klasik: 0.5 });
    expect(p.butce.segmentler).toEqual({ orta: 1 });
    expect(p.yasAraligi).toBe('25_34');
  });

  test('test yok, 3 kayıt: yalnız davranış (kaynak davranis)', () => {
    const p = profilHesapla(
      {
        ...bos(),
        kayitlar: [
          kayit({ butik: butik({ tarz1: 'bohem' }) }),
          kayit({ butik: butik({ tarz1: 'bohem' }) }),
          kayit({ butik: butik({ tarz1: 'minimal' }) }),
        ],
      },
      SIMDI,
    );
    expect(p.kaynak).toBe('davranis');
    expect(p.tarz.bohem).toBeCloseTo(1);
    expect(p.tarz.minimal).toBeCloseTo(0.5);
    expect(p.yasAraligi).toBeNull();
  });

  test('test yok ve 3 kayıt/favoriden az: bos (butik açmalar ve satın alma sayılmaz)', () => {
    expect(BOS_ESIGI).toBe(3);
    const p = profilHesapla(
      {
        ...bos(),
        kayitlar: [kayit({ satinAlindi: SIMDI })],
        favoriler: [{ butik: butik(), zaman: SIMDI }],
        butikAcmalari: Array.from({ length: 50 }, () => ({ butik: butik(), zaman: SIMDI })),
      },
      SIMDI,
    );
    expect(p.kaynak).toBe('bos');
    expect(p.kayitSayisi).toBe(3);
    expect(p.tarz).toEqual({});
    expect(p.butce).toEqual({ segmentler: {}, ortanca: {} });
    expect(p.kategoriler).toEqual({});
    expect(p.urunEtiketleri).toEqual({ tur: {}, renk: {}, malzeme: {} });
  });

  test('2 kayıt + 1 favori bos değildir', () => {
    const p = profilHesapla(
      { ...bos(), kayitlar: [kayit(), kayit()], favoriler: [{ butik: butik(), zaman: SIMDI }] },
      SIMDI,
    );
    expect(p.kaynak).toBe('davranis');
  });

  test('hiçbir şey yoksa bos; guncellendi = simdi', () => {
    const p = profilHesapla(bos(), SIMDI);
    expect(p.kaynak).toBe('bos');
    expect(p.kayitSayisi).toBe(0);
    expect(p.guncellendi).toEqual(SIMDI);
  });

  test('davranışın tarzı yoksa test tam alınır', () => {
    const p = profilHesapla(
      {
        ...bos(),
        test: { tarzPuanlari: { minimal: 2 }, fiyatSegmentleri: [], yasAraligi: null },
        kayitlar: Array.from({ length: 5 }, () => kayit({ butik: butik({ tarz1: null }) })),
      },
      SIMDI,
    );
    expect(p.tarz).toEqual({ minimal: 1 });
  });

  test('silme sıfırın altına düşen tarzı tamamen çıkarır', () => {
    const p = profilHesapla(
      {
        ...bos(),
        kayitlar: [kayit(), kayit(), kayit({ butik: butik({ tarz1: 'bohem' }) })],
        kayitSilmeleri: Array.from({ length: 5 }, () => ({
          butik: butik({ tarz1: 'bohem' }),
          zaman: SIMDI,
        })),
      },
      SIMDI,
    );
    expect(p.tarz).toEqual({ minimal: 1 });
  });
});

describe('bütçe', () => {
  test('test segmentleri ile kaydedilen butik segmentleri aynı oranla karışır', () => {
    // 5 kayıt → pay 0.3. Test: orta, yuksek (ikisi 1). Davranış: luks 4 kayıt, orta 1 kayıt.
    const p = profilHesapla(
      {
        ...bos(),
        test: {
          tarzPuanlari: { minimal: 1 },
          fiyatSegmentleri: ['orta', 'yuksek'],
          yasAraligi: null,
        },
        kayitlar: [
          ...Array.from({ length: 4 }, () => kayit({ butik: butik({ fiyatSegmenti: 'luks' }) })),
          kayit({ butik: butik({ fiyatSegmenti: 'orta' }) }),
        ],
      },
      SIMDI,
    );
    expect(p.butce.segmentler.orta).toBeCloseTo(0.7 + 0.3 * 0.25);
    expect(p.butce.segmentler.yuksek).toBeCloseTo(0.7);
    expect(p.butce.segmentler.luks).toBeCloseTo(0.3);
  });

  test('segment yalnız kayıt ve satın almadan gelir; butik açma ve favori katmaz', () => {
    const h = hamDavranis(
      {
        ...bos(),
        kayitlar: [kayit({ butik: butik({ fiyatSegmenti: 'orta' }), satinAlindi: SIMDI })],
        favoriler: [{ butik: butik({ fiyatSegmenti: 'luks' }), zaman: SIMDI }],
        butikAcmalari: [{ butik: butik({ fiyatSegmenti: 'uygun' }), zaman: SIMDI }],
      },
      SIMDI,
    );
    expect(h.segmentler).toEqual({ orta: 5 });
  });

  test('ortanca: tek adet ortadaki, çift adet ortadaki ikisinin ortalaması', () => {
    const fiyatli = (minor: number) => kayit({ fiyat: { minor, paraBirimi: 'TRY' } });
    const tek = profilHesapla(
      { ...bos(), kayitlar: [fiyatli(300), fiyatli(100), fiyatli(200)] },
      SIMDI,
    );
    expect(tek.butce.ortanca).toEqual({ TRY: 200 });
    const cift = profilHesapla(
      { ...bos(), kayitlar: [fiyatli(100), fiyatli(200), fiyatli(301), fiyatli(400)] },
      SIMDI,
    );
    expect(cift.butce.ortanca).toEqual({ TRY: 251 });
  });

  test('fiyatı okunmamış ya da pazar para birimi dışındaki ürün ortancaya girmez', () => {
    const p = profilHesapla(
      {
        ...bos(),
        kayitlar: [
          kayit({ fiyat: { minor: 100, paraBirimi: 'TRY' } }),
          kayit({ fiyat: null }),
          kayit({ fiyat: { minor: 9999, paraBirimi: 'USD' } }),
          kayit({
            butik: butik({ pazarParaBirimi: 'USD' }),
            fiyat: { minor: 5000, paraBirimi: 'USD' },
          }),
          kayit({
            butik: butik({ pazarParaBirimi: null }),
            fiyat: { minor: 7, paraBirimi: 'TRY' },
          }),
        ],
      },
      SIMDI,
    );
    expect(p.butce.ortanca).toEqual({ TRY: 100, USD: 5000 });
  });
});

describe('kategoriler, ürün etiketleri, yaş', () => {
  test('kategoriler tüm hareketlerden ağırlıkla gelir, 0–1 ölçeklenir', () => {
    const p = profilHesapla(
      {
        ...bos(),
        kayitlar: [
          kayit({ butik: butik({ kategoriIdleri: ['k1', 'k2'] }) }),
          kayit({ butik: butik({ kategoriIdleri: ['k1'] }) }),
          kayit({ butik: butik({ kategoriIdleri: ['k1'] }) }),
        ],
        butikAcmalari: [{ butik: butik({ kategoriIdleri: ['k3'] }), zaman: SIMDI }],
      },
      SIMDI,
    );
    expect(p.kategoriler.k1).toBeCloseTo(1);
    expect(p.kategoriler.k2).toBeCloseTo(2 / 6);
    expect(p.kategoriler.k3).toBeCloseTo(0.3 / 6);
  });

  test('ürün etiketleri kayıt ve satın almadan; boş etiket atlanır', () => {
    const p = profilHesapla(
      {
        ...bos(),
        kayitlar: [
          kayit({ etiket: { tur: 'elbise', renk: 'siyah', malzeme: null }, satinAlindi: SIMDI }),
          kayit({ etiket: { tur: 'elbise', renk: 'beyaz', malzeme: 'keten' } }),
          kayit({ etiket: { tur: 'bluz', renk: null, malzeme: null } }),
        ],
      },
      SIMDI,
    );
    expect(p.urunEtiketleri.tur).toEqual({ elbise: 1, bluz: 0.2857 });
    expect(p.urunEtiketleri.renk).toEqual({ siyah: 1, beyaz: 0.4 });
    expect(p.urunEtiketleri.malzeme).toEqual({ keten: 1 });
  });

  test('yaş yalnız testten gelir', () => {
    const p = profilHesapla(
      {
        ...bos(),
        test: { tarzPuanlari: { minimal: 1 }, fiyatSegmentleri: [], yasAraligi: '35_44' },
      },
      SIMDI,
    );
    expect(p.yasAraligi).toBe('35_44');
  });

  test('puanlar 4 basamağa yuvarlanır', () => {
    const p = profilHesapla(
      {
        ...bos(),
        kayitlar: [kayit(), kayit(), kayit({ butik: butik({ tarz1: 'minimal', tarz2: 'bohem' }) })],
      },
      SIMDI,
    );
    // minimal 6, bohem 1 → 1/6
    expect(p.tarz.bohem).toBe(0.1667);
  });
});
