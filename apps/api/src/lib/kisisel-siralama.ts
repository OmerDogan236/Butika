import { FIYAT_SEGMENTLERI, YAS_ARALIKLARI, type YasAraligi } from '@butika/types';
import type { KategoriEgilimi } from './detayli-test-kategori';
import { AGIRLIK, fiyatPuani, olcekle, tarzEslesmesi } from './oneriler';

// Vitrinde "Sana özel": kategorideki butikleri kullanıcının tarzı ve bütçesine göre dizer.
// Hiçbir butik çıkarılmaz; eşit puanda girdi (admin) sırası korunur.
// Tasarım: docs/superpowers/specs/2026-10-01-kisisel-butika-tasarim.md (bölüm 2)

export interface KisiselGirdi {
  testPuanlari: Record<string, number> | null;
  favoriPuanlari: Record<string, number>;
  fiyatSegmentleri: string[];
  yasAraligi?: string | null;
  /** Detaylı testten kategori id eğilimi (spec 2026-10-16 §5); yoksa etkisiz. */
  kategoriEgilimi?: KategoriEgilimi | null;
}

interface Siralanabilir {
  tarz1: string | null;
  tarz2: string | null;
  fiyatSegmenti: string | null;
  hedefYaslar: string[] | null;
  kategoriIdleri?: string[];
}

/** Hedef yaş aralığı kullanıcıyla aynıysa +2.5, komşuysa +1, daha uzaksa −1; bilgi yoksa 0. */
export function yasPuani(hedef: string[] | null, kullanici: string | null | undefined): number {
  if (!kullanici || !hedef || hedef.length === 0) return 0;
  const k = YAS_ARALIKLARI.indexOf(kullanici as YasAraligi);
  if (k === -1) return 0;
  const konumlar = hedef.map((h) => YAS_ARALIKLARI.indexOf(h as YasAraligi)).filter((i) => i >= 0);
  if (konumlar.length === 0) return 0;
  const mesafe = Math.min(...konumlar.map((i) => Math.abs(i - k)));
  return mesafe === 0 ? 2.5 : mesafe === 1 ? 1 : -1;
}

/** Öne ile arkaya arasındaki fark (2), tarz eşleşmesini (AGIRLIK.test = 3) ezmesin diye 1. */
export const DETAYLI_KATEGORI_PUANI = 1;

/** Butik öne alınan bir kategorideyse +, yalnız alta atılan bir kategorideyse −. */
export function kategoriPuani(
  idler: string[] | undefined,
  egilim: KategoriEgilimi | null | undefined,
): number {
  if (!egilim || !idler || idler.length === 0) return 0;
  if (idler.some((id) => egilim.one.has(id))) return DETAYLI_KATEGORI_PUANI;
  if (idler.some((id) => egilim.alta.has(id))) return -DETAYLI_KATEGORI_PUANI;
  return 0;
}

export function kisiselSirala<T extends Siralanabilir>(satirlar: T[], girdi: KisiselGirdi): T[] {
  const v = olcekle(girdi.testPuanlari);
  const f = olcekle(girdi.favoriPuanlari);
  const puanli = satirlar.map((s, sira) => ({
    s,
    sira,
    puan:
      AGIRLIK.test * tarzEslesmesi(s, v) +
      AGIRLIK.favori * tarzEslesmesi(s, f) +
      fiyatPuani(s, girdi.fiyatSegmentleri) +
      yasPuani(s.hedefYaslar, girdi.yasAraligi) +
      kategoriPuani(s.kategoriIdleri, girdi.kategoriEgilimi),
  }));
  return puanli.sort((x, y) => y.puan - x.puan || x.sira - y.sira).map((x) => x.s);
}

// --- Profil ile sıralama (PROFIL_VITRIN_ENABLED) ---
// Tasarım: docs/superpowers/specs/2026-10-05-kullanici-profili-tasarim.md (§4)

/** Vitrinin profilden kullandığı alanlar; puanlar 0–1 (en yüksek 1). */
export interface ProfilSiraGirdisi {
  tarz: Record<string, number>;
  butceSegmentleri: Record<string, number>;
  yasAraligi: string | null;
  kategoriler: Record<string, number>;
  /** Detaylı testten kategori eğilimi; profilden ayrı, yoksa etkisiz. */
  kategoriEgilimi?: KategoriEgilimi | null;
}

/** Profilin kategori ilgisi en çok bu kadar puan verir; tarz eşleşmesini (3) ezmesin. */
export const PROFIL_KATEGORI_PUANI = 1;

const segmentSirasi = (s: string) =>
  FIYAT_SEGMENTLERI.indexOf(s as (typeof FIYAT_SEGMENTLERI)[number]);

/**
 * Butiğin segmenti profilde puanlıysa tam (2) × puan, komşu segment puanlıysa komşu (0.5) ×
 * puan; en yükseği. Yalnız testten gelen profilde (her seçilen segment 1) fiyatPuani ile aynı.
 */
export function butcePuani(segment: string | null, puanlar: Record<string, number>): number {
  if (!segment) return 0;
  const i = segmentSirasi(segment);
  if (i === -1) return 0;
  let enIyi = 0;
  for (const [s, p] of Object.entries(puanlar)) {
    const j = segmentSirasi(s);
    if (j === -1 || p <= 0) continue;
    if (j === i) enIyi = Math.max(enIyi, AGIRLIK.fiyatTam * p);
    else if (Math.abs(j - i) === 1) enIyi = Math.max(enIyi, AGIRLIK.fiyatKomsu * p);
  }
  return enIyi;
}

/** Butiğin kategorilerinden profildeki en yüksek ilgi × PROFIL_KATEGORI_PUANI. */
export function kategoriIlgisiPuani(
  idler: string[] | undefined,
  puanlar: Record<string, number>,
): number {
  if (!idler || idler.length === 0) return 0;
  return PROFIL_KATEGORI_PUANI * Math.max(0, ...idler.map((id) => puanlar[id] ?? 0));
}

/** "Sana özel": profilin tarzı, bütçesi, yaşı ve kategori ilgisi. Eşitlikte admin sırası. */
export function profilleSirala<T extends Siralanabilir>(satirlar: T[], g: ProfilSiraGirdisi): T[] {
  const puanli = satirlar.map((s, sira) => ({
    s,
    sira,
    puan:
      AGIRLIK.test * tarzEslesmesi(s, g.tarz) +
      butcePuani(s.fiyatSegmenti, g.butceSegmentleri) +
      yasPuani(s.hedefYaslar, g.yasAraligi) +
      kategoriIlgisiPuani(s.kategoriIdleri, g.kategoriler) +
      kategoriPuani(s.kategoriIdleri, g.kategoriEgilimi),
  }));
  return puanli.sort((x, y) => y.puan - x.puan || x.sira - y.sira).map((x) => x.s);
}

/**
 * Seçkideki (Editörün Seçimi) butikleri sona alır, kendi aralarındaki ve diğerlerinin
 * sırası korunur. Tarz testi yapmış kullanıcının kategori listesinde: seçki şeridinde
 * en üstte zaten görünen butik aynı ekranda bir daha öne çıkmasın (sahip kararı, 3 Eki).
 */
export function seckiyiSonaAl<T extends { editorSecimi: boolean }>(satirlar: T[]): T[] {
  return [...satirlar.filter((s) => !s.editorSecimi), ...satirlar.filter((s) => s.editorSecimi)];
}
