import { describe, expect, test } from 'bun:test';
import { BOS_DETAYLI_CEVAP, type DetayliTestCevaplari } from '@butika/types';
import { kategoriEgilimi, kategoriSirala, slugAnahtari } from './detayli-test-kategori';

const c = (ek: Partial<DetayliTestCevaplari>): DetayliTestCevaplari => ({
  ...BOS_DETAYLI_CEVAP,
  ...ek,
});
const liste = (...s: string[]) => s.map((slug) => ({ slug }));
const sirala = (k: { slug: string }[], cevap: DetayliTestCevaplari) =>
  kategoriSirala(k, kategoriEgilimi(cevap), (x) => x.slug).map((x) => x.slug);

const ADMIN = liste('gunlukgiyim', 'tesettur', 'kidscorner', 'abiye', 'hamile-giyim', 'plaj');

describe('kategoriEgilimi', () => {
  test('boş cevap → değişiklik yok', () => {
    const e = kategoriEgilimi(BOS_DETAYLI_CEVAP);
    expect([...e.one]).toEqual([]);
    expect([...e.alta]).toEqual([]);
  });
  test('tesettür bazen → etkisiz', () =>
    expect(kategoriEgilimi(c({ tesettur: 'bazen' })).alta.size).toBe(0));
  test('çocuk var + 0–2 → kidscorner ve organik bebek öne', () => {
    const e = kategoriEgilimi(c({ cocuk: { var: true, yaslar: ['0_2'], cinsiyet: null } }));
    expect([...e.one].sort()).toEqual(['kidscorner', 'organikbebekgiyim']);
  });
  test('çocuk yok → iki çocuk kategorisi alta', () =>
    expect(
      [...kategoriEgilimi(c({ cocuk: { var: false, yaslar: [], cinsiyet: null } })).alta].sort(),
    ).toEqual(['kidscorner', 'organikbebekgiyim']));
  test('çocuk sorusu geçildi → çocuk kategorilerine dokunulmaz', () => {
    const e = kategoriEgilimi(c({ cocuk: null }));
    expect(e.one.has('kidscorner')).toBe(false);
    expect(e.alta.has('kidscorner')).toBe(false);
  });
  test('çocuk var, 0–2 yaş yok → yalnız kidscorner öne, bebek giyim öne çıkmaz', () => {
    const e = kategoriEgilimi(c({ cocuk: { var: true, yaslar: ['7_12'], cinsiyet: 'erkek' } }));
    expect(e.one.has('kidscorner')).toBe(true);
    expect(e.one.has('organikbebekgiyim')).toBe(false);
    expect(e.alta.size).toBe(0);
  });
  test('büyük beden, ürünler ve durumlar öne', () => {
    const e = kategoriEgilimi(
      c({ buyukBeden: true, urunler: ['guzellik'], durumlar: ['spor', 'is'] }),
    );
    expect([...e.one].sort()).toEqual(['buyukbeden', 'guzellik', 'parfumkoku', 'sporgiyim']);
  });
});

describe('kategoriSirala', () => {
  test('boş cevap → admin sırası', () =>
    expect(sirala(ADMIN, BOS_DETAYLI_CEVAP)).toEqual(ADMIN.map((x) => x.slug)));
  test('hayır → en alta, öne alınanlar başa, ara sıra korunur', () =>
    expect(
      sirala(ADMIN, c({ tesettur: 'hayir', hamile: 'hayir', urunler: ['abiye', 'mayo'] })),
    ).toEqual(['abiye', 'plaj', 'gunlukgiyim', 'kidscorner', 'tesettur', 'hamile-giyim']));
  test('pazarda olmayan slug etkisiz', () =>
    expect(sirala(liste('dresses', 'bags'), c({ tesettur: 'hayir', urunler: ['canta'] }))).toEqual([
      'dresses',
      'bags',
    ]));
  test('girdi dizisi değişmez', () => {
    const k = liste('a', 'tesettur', 'b');
    sirala(k, c({ tesettur: 'hayir' }));
    expect(k.map((x) => x.slug)).toEqual(['a', 'tesettur', 'b']);
  });
});

describe('slugAnahtari', () => {
  test('tire, alt çizgi ve boşluk yok sayılır', () => {
    expect(slugAnahtari('buyuk-beden')).toBe(slugAnahtari('buyukbeden'));
    expect(slugAnahtari('Büyük_Beden')).toBe('büyükbeden');
  });
  test('hamile-giyim', () => expect(slugAnahtari('hamile-giyim')).toBe('hamilegiyim'));
});
