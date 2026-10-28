import {
  type FiyatSegmenti,
  KISA_SENARYO,
  TEST_SURUMU_KISA,
  type Tarz,
  type TarzTestiGonder,
  type YasAraligi,
} from '@butika/types';

// Kısa tarz testi (sürüm 2): kahvaltı senaryosu → tarz (1–3) → fiyat → yaş.
// Her adım atlanabilir; hepsi atlanırsa kayıt yapılmaz.
// Tasarım: docs/superpowers/specs/2026-10-01-kisisel-butika-tasarim.md (§1, §8)

export type TestKaynagi =
  | 'onboarding'
  | 'guncelleme'
  | 'vitrin_karti'
  | 'siralama_menusu'
  | 'ayarlar'
  | 'profil';

export interface KisaCevap {
  kahvalti: string[];
  acikTarzlar: Tarz[];
  fiyatSegmentleri: FiyatSegmenti[];
  yasAraligi: YasAraligi | null;
}

export const KISA_ADIM_SAYISI = 4;

export const bosCevap = (): KisaCevap => ({
  kahvalti: [],
  acikTarzlar: [],
  fiyatSegmentleri: [],
  yasAraligi: null,
});

export function atlananAdimSayisi(c: KisaCevap): number {
  const bosListe = [c.kahvalti, c.acikTarzlar, c.fiyatSegmentleri].filter(
    (x) => x.length === 0,
  ).length;
  return bosListe + (c.yasAraligi ? 0 : 1);
}

export function gonderimeCevir(c: KisaCevap): TarzTestiGonder | null {
  if (atlananAdimSayisi(c) === KISA_ADIM_SAYISI) return null;
  return {
    testSurumu: TEST_SURUMU_KISA,
    senaryo: c.kahvalti.length > 0 ? { [KISA_SENARYO]: c.kahvalti } : {},
    acikTarzlar: c.acikTarzlar,
    fiyatSegmentleri: c.fiyatSegmentleri,
    renkler: [],
    yasAraligi: c.yasAraligi,
  };
}

/** Gönderimden atlanan adım sayısı (telefonda bekleyen cevap yeniden gönderilince ölçüm için). */
export function gonderimdenAtlanan(g: TarzTestiGonder): number {
  if (g.testSurumu !== TEST_SURUMU_KISA) return 0;
  return atlananAdimSayisi({
    kahvalti: g.senaryo[KISA_SENARYO] ?? [],
    acikTarzlar: g.acikTarzlar,
    fiyatSegmentleri: g.fiyatSegmentleri,
    yasAraligi: ('yasAraligi' in g ? g.yasAraligi : null) ?? null,
  });
}
