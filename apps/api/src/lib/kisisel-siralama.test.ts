import { describe, expect, test } from 'bun:test';
import {
  DETAYLI_KATEGORI_PUANI,
  PROFIL_KATEGORI_PUANI,
  butcePuani,
  kategoriIlgisiPuani,
  kategoriPuani,
  kisiselSirala,
  profilleSirala,
  seckiyiSonaAl,
  yasPuani,
} from './kisisel-siralama';
import { fiyatPuani } from './oneriler';

const b = (
  id: string,
  tarz1: string | null,
  fiyatSegmenti: string | null,
  tarz2: string | null = null,
) => ({ id, tarz1, tarz2, fiyatSegmenti, hedefYaslar: null });
// Girdi sırası = admin sırası.
const admin = [
  b('a', 'bohem', 'luks'),
  b('b', null, null),
  b('c', 'minimal', 'orta'),
  b('d', 'minimal', 'luks'),
  b('e', 'sokak', 'uygun'),
];

describe('kisiselSirala', () => {
  test('test ve favori yoksa sıra değişmez', () => {
    expect(
      kisiselSirala(admin, { testPuanlari: null, favoriPuanlari: {}, fiyatSegmentleri: [] }).map(
        (x) => x.id,
      ),
    ).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  test('tarz ve fiyat uyanlar üste, eşitlikte admin sırası', () => {
    const s = kisiselSirala(admin, {
      testPuanlari: { minimal: 5 },
      favoriPuanlari: {},
      fiyatSegmentleri: ['orta'],
    });
    // c = 3+2 = 5 (test minimal + fiyat orta tam), d = 3 (test minimal, luks orta'ya komşu değil),
    // e = 0.5 (no test, uygun komşu orta), a = b = 0.
    expect(s.map((x) => x.id)).toEqual(['c', 'd', 'e', 'a', 'b']);
  });
  test('hiçbir butik kaybolmaz ve tekrarlanmaz', () => {
    const s = kisiselSirala(admin, {
      testPuanlari: { sokak: 1 },
      favoriPuanlari: { bohem: 2 },
      fiyatSegmentleri: ['luks'],
    });
    expect([...s.map((x) => x.id)].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  test('verisi eksik butik puansızların arasında admin sırasıyla kalır', () => {
    const s = kisiselSirala(admin, {
      testPuanlari: { minimal: 1 },
      favoriPuanlari: {},
      fiyatSegmentleri: [],
    });
    expect(s.slice(0, 2).map((x) => x.id)).toEqual(['c', 'd']);
    expect(s.slice(2).map((x) => x.id)).toEqual(['a', 'b', 'e']);
  });
  test('komşu fiyat segmenti tam eşleşmeden sonra gelir', () => {
    const liste = [b('x', null, 'yuksek'), b('y', null, 'orta')];
    expect(
      kisiselSirala(liste, {
        testPuanlari: null,
        favoriPuanlari: {},
        fiyatSegmentleri: ['orta'],
      }).map((x) => x.id),
    ).toEqual(['y', 'x']);
  });
  test('test verisi varsa da fiyat eşleşmezse sırada değişiklik olmaz, ama eşleşirse ön sıraya gelir', () => {
    const liste = [b('x', 'bohem', 'luks'), b('y', 'sokak', 'orta')];
    const s = kisiselSirala(liste, {
      testPuanlari: { minimal: 1 },
      favoriPuanlari: {},
      fiyatSegmentleri: ['orta'],
    });
    // x: test 0, fiyat 0 (luks not adjacent to orta) = 0
    // y: test 0, fiyat 2 (orta matches) = 2
    // y has higher score, comes first despite admin order.
    expect(s.map((x) => x.id)).toEqual(['y', 'x']);
  });
});

describe('yasPuani', () => {
  test('eşit aralık +2.5', () => expect(yasPuani(['25_34', '35_44'], '35_44')).toBe(2.5));
  test('komşu +1', () => expect(yasPuani(['25_34'], '35_44')).toBe(1));
  test('2+ uzak −1', () => expect(yasPuani(['18_24'], '55_plus')).toBe(-1));
  test('bilgi yoksa 0', () => {
    expect(yasPuani(null, '25_34')).toBe(0);
    expect(yasPuani([], '25_34')).toBe(0);
    expect(yasPuani(['25_34'], null)).toBe(0);
  });
  test('bilinmeyen hedef değerleri atlanır', () => {
    expect(yasPuani(['x'], '25_34')).toBe(0);
    expect(yasPuani(['x', '25_34'], '25_34')).toBe(2.5);
  });
});

test('yaş sıralamayı değiştirir, butik kaybolmaz', () => {
  const liste = [
    { id: 'genc', tarz1: 'minimal', tarz2: null, fiyatSegmenti: null, hedefYaslar: ['18_24'] },
    {
      id: 'yetiskin',
      tarz1: 'minimal',
      tarz2: null,
      fiyatSegmenti: null,
      hedefYaslar: ['45_54', '55_plus'],
    },
    { id: 'bilinmiyor', tarz1: 'minimal', tarz2: null, fiyatSegmenti: null, hedefYaslar: null },
  ];
  const s = kisiselSirala(liste, {
    testPuanlari: { minimal: 1 },
    favoriPuanlari: {},
    fiyatSegmentleri: [],
    yasAraligi: '55_plus',
  });
  expect(s.map((x) => x.id)).toEqual(['yetiskin', 'bilinmiyor', 'genc']);
});

describe('seckiyiSonaAl', () => {
  test('seçkidekiler sona, sıralar korunur', () => {
    const r = seckiyiSonaAl([
      { id: 'a', editorSecimi: true },
      { id: 'b', editorSecimi: false },
      { id: 'c', editorSecimi: true },
      { id: 'd', editorSecimi: false },
    ]);
    expect(r.map((x) => x.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('kategori eğilimi', () => {
  const egilim = { one: new Set(['k-tesettur']), alta: new Set(['k-cocuk']) };
  test('öne alınan kategoride → +', () =>
    expect(kategoriPuani(['k-giyim', 'k-tesettur'], egilim)).toBe(DETAYLI_KATEGORI_PUANI));
  test('alta atılan kategoride → −', () =>
    expect(kategoriPuani(['k-cocuk'], egilim)).toBe(-DETAYLI_KATEGORI_PUANI));
  test('ikisinde de → öne kazanır', () =>
    expect(kategoriPuani(['k-cocuk', 'k-tesettur'], egilim)).toBe(DETAYLI_KATEGORI_PUANI));
  test('eğilim ya da kategori yoksa 0', () => {
    expect(kategoriPuani(['k-tesettur'], null)).toBe(0);
    expect(kategoriPuani(undefined, egilim)).toBe(0);
  });
  test('eşit tarzda tesettür de yapan butik öne, çocuk butiği sona', () => {
    const r = (id: string, kategoriIdleri: string[]) => ({
      id,
      tarz1: 'minimal',
      tarz2: null,
      fiyatSegmenti: null,
      hedefYaslar: null,
      kategoriIdleri,
    });
    const s = kisiselSirala([r('a', ['k-cocuk']), r('b', []), r('c', ['k-tesettur'])], {
      testPuanlari: { minimal: 5 },
      favoriPuanlari: {},
      fiyatSegmentleri: [],
      kategoriEgilimi: egilim,
    });
    expect(s.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('butcePuani (profil bütçesi)', () => {
  test('tam eşleşme 2 × puan, komşu 0.5 × puan, en yükseği', () => {
    expect(butcePuani('orta', { orta: 1 })).toBe(2);
    expect(butcePuani('orta', { orta: 0.5 })).toBe(1);
    expect(butcePuani('yuksek', { orta: 1 })).toBe(0.5);
    // Komşu tam puan (0.5) < kendi segmenti düşük puan (2 × 0.4 = 0.8)
    expect(butcePuani('orta', { orta: 0.4, yuksek: 1 })).toBeCloseTo(0.8);
    expect(butcePuani('luks', { uygun: 1 })).toBe(0);
  });
  test('segmenti ya da profil bütçesi yoksa 0', () => {
    expect(butcePuani(null, { orta: 1 })).toBe(0);
    expect(butcePuani('orta', {})).toBe(0);
    expect(butcePuani('bilinmeyen', { orta: 1 })).toBe(0);
  });
  test('yalnız testten gelen bütçe bugünkü fiyatPuani ile aynı', () => {
    for (const seg of ['uygun', 'orta', 'yuksek', 'luks']) {
      for (const secilen of [['orta'], ['uygun', 'luks'], ['yuksek']]) {
        const puanlar = Object.fromEntries(secilen.map((x) => [x, 1]));
        expect(butcePuani(seg, puanlar)).toBe(fiyatPuani({ fiyatSegmenti: seg }, secilen));
      }
    }
  });
});

describe('kategoriIlgisiPuani', () => {
  test('butiğin kategorilerinden en yüksek profil puanı × 1', () => {
    expect(kategoriIlgisiPuani(['a', 'b'], { a: 0.3, b: 0.8 })).toBeCloseTo(
      0.8 * PROFIL_KATEGORI_PUANI,
    );
    expect(kategoriIlgisiPuani(['c'], { a: 1 })).toBe(0);
    expect(kategoriIlgisiPuani(undefined, { a: 1 })).toBe(0);
    expect(kategoriIlgisiPuani(['a'], {})).toBe(0);
  });
  test('tarz eşleşmesini (3) ezmez', () => {
    expect(PROFIL_KATEGORI_PUANI).toBeLessThan(3);
  });
});

describe('profilleSirala', () => {
  const s = (
    id: string,
    tarz1: string | null,
    fiyatSegmenti: string | null,
    extra: { hedefYaslar?: string[] | null; kategoriIdleri?: string[]; tarz2?: string } = {},
  ) => ({
    id,
    tarz1,
    tarz2: extra.tarz2 ?? null,
    fiyatSegmenti,
    hedefYaslar: extra.hedefYaslar ?? null,
    kategoriIdleri: extra.kategoriIdleri,
  });
  const bos = { tarz: {}, butceSegmentleri: {}, yasAraligi: null, kategoriler: {} };

  test('boş profilde admin sırası korunur', () => {
    const liste = [s('a', 'bohem', 'luks'), s('b', null, null), s('c', 'minimal', 'orta')];
    expect(profilleSirala(liste, bos).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  test('tarz (tarz2 yarım) + bütçe + yaş + kategori ilgisi toplanır', () => {
    const liste = [
      s('yalniz-kategori', null, null, { kategoriIdleri: ['k1'] }),
      s('tarz2', 'sokak', null, { tarz2: 'minimal' }),
      s('tarz1', 'minimal', null),
      s('tarz-butce', 'minimal', 'orta'),
      s('tarz-butce-yas', 'minimal', 'orta', { hedefYaslar: ['25_34'] }),
      s('hicbiri', 'vintage', 'luks'),
    ];
    const sirali = profilleSirala(liste, {
      tarz: { minimal: 1, sokak: 0.2 },
      butceSegmentleri: { orta: 1 },
      yasAraligi: '25_34',
      kategoriler: { k1: 1 },
    });
    // tarz-butce-yas: 3 + 2 + 2.5 = 7.5; tarz-butce: 5; tarz1: 3;
    // tarz2: 3×(0.2 + 0.5×1) = 2.1; yalniz-kategori: 1; hicbiri: 0
    expect(sirali.map((x) => x.id)).toEqual([
      'tarz-butce-yas',
      'tarz-butce',
      'tarz1',
      'tarz2',
      'yalniz-kategori',
      'hicbiri',
    ]);
  });

  test('detaylı test kategori eğilimi de puana girer', () => {
    const liste = [
      s('alta', 'minimal', null, { kategoriIdleri: ['x'] }),
      s('one', 'minimal', null, { kategoriIdleri: ['y'] }),
    ];
    const sirali = profilleSirala(liste, {
      ...bos,
      tarz: { minimal: 1 },
      kategoriEgilimi: { one: new Set(['y']), alta: new Set(['x']) },
    });
    expect(sirali.map((x) => x.id)).toEqual(['one', 'alta']);
    expect(DETAYLI_KATEGORI_PUANI).toBe(1);
  });

  test('hiçbir butik kaybolmaz ve tekrarlanmaz; eşitlikte admin sırası', () => {
    const liste = [s('a', 'bohem', 'uygun'), s('b', 'bohem', 'uygun'), s('c', null, null)];
    const sirali = profilleSirala(liste, { ...bos, tarz: { bohem: 1 } });
    expect(sirali.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});
