import type {
  ProfilButcesi,
  ProfilKaynagi,
  ProfilPuanlari,
  ProfilUrunEtiketleri,
} from '@butika/db';
import { AGIRLIK, TARZ2_PAYI, olcekle } from '../oneriler';

// Kullanıcı profili hesabı. Saf işlev: veritabanına dokunmaz; girdileri profil-kaydet.ts toplar.
// Tasarım: docs/superpowers/specs/2026-10-05-kullanici-profili-tasarim.md (§1–2)

/** Hareket ağırlıkları (spec 2.1). Favori, öneri puanlamasındaki favori ağırlığıyla aynıdır. */
export const PROFIL_AGIRLIK = {
  satinAlma: 3,
  kayit: 2,
  favori: AGIRLIK.favori,
  butikAcma: 0.3,
  kayitSilme: -1,
} as const;

/** Bir hareketin etkisi bu kadar günde yarıya iner (spec 2.2). */
export const YARILANMA_GUN = 90;
/** Test varken davranışın alabileceği en yüksek pay (spec 2.3). */
export const DAVRANIS_PAYI_UST = 0.6;
/** Bu kadar kayıtta davranış payı tavana ulaşır. */
const DAVRANIS_DOYUM = 10;
/** Test yoksa profil için gereken en az kayıt + favori sayısı. */
export const BOS_ESIGI = 3;

const GUN_MS = 24 * 60 * 60 * 1000;

export interface ProfilButigi {
  tarz1: string | null;
  tarz2: string | null;
  fiyatSegmenti: string | null;
  kategoriIdleri: string[];
  /** Butiğin pazarının para birimi (TR → TRY); bilinmiyorsa null. */
  pazarParaBirimi: string | null;
}

export interface ProfilKaydi {
  butik: ProfilButigi;
  kaydedildi: Date;
  satinAlindi: Date | null;
  /** Okunmuş güncel fiyat; okunamadıysa null. */
  fiyat: { minor: number; paraBirimi: string } | null;
  etiket: { tur: string | null; renk: string | null; malzeme: string | null };
}

export interface ProfilHareketi {
  butik: ProfilButigi;
  zaman: Date;
}

export interface ProfilTesti {
  /** Ham test puanları (kayittanTestPuanlari). */
  tarzPuanlari: Record<string, number>;
  fiyatSegmentleri: string[];
  yasAraligi: string | null;
}

export interface ProfilGirdileri {
  test: ProfilTesti | null;
  kayitlar: ProfilKaydi[];
  /** Butiği favorilere ekleme. Bugün uygulamada bu özellik yok; boş gelir. */
  favoriler: ProfilHareketi[];
  /** boutique_view / webview_open */
  butikAcmalari: ProfilHareketi[];
  /** Kaydı silme (product_unsaved). */
  kayitSilmeleri: ProfilHareketi[];
}

export interface KullaniciProfili {
  tarz: ProfilPuanlari;
  butce: ProfilButcesi;
  kategoriler: ProfilPuanlari;
  urunEtiketleri: ProfilUrunEtiketleri;
  yasAraligi: string | null;
  kayitSayisi: number;
  kaynak: ProfilKaynagi;
  guncellendi: Date;
}

/** 0.5 ^ (gün / 90). Gelecekteki zaman (saat farkı) 1 sayılır. */
export function azalma(zaman: Date, simdi: Date): number {
  const gun = Math.max(0, (simdi.getTime() - zaman.getTime()) / GUN_MS);
  return 0.5 ** (gun / YARILANMA_GUN);
}

/** min(0.6, kayitSayisi / 10 × 0.6) */
export function davranisPayi(kayitSayisi: number): number {
  return Math.min(DAVRANIS_PAYI_UST, (kayitSayisi / DAVRANIS_DOYUM) * DAVRANIS_PAYI_UST);
}

function ekle(puan: Record<string, number>, anahtar: string | null, deger: number): void {
  if (!anahtar || deger === 0) return;
  puan[anahtar] = (puan[anahtar] ?? 0) + deger;
}

export interface HamDavranis {
  tarz: Record<string, number>;
  segmentler: Record<string, number>;
  kategoriler: Record<string, number>;
  etiketler: {
    tur: Record<string, number>;
    renk: Record<string, number>;
    malzeme: Record<string, number>;
  };
}

/** Ağırlıklı ve zamanla azaltılmış ham davranış puanları (ölçeklenmemiş, eksi olabilir). */
export function hamDavranis(g: ProfilGirdileri, simdi: Date): HamDavranis {
  const h: HamDavranis = {
    tarz: {},
    segmentler: {},
    kategoriler: {},
    etiketler: { tur: {}, renk: {}, malzeme: {} },
  };

  // Butik düzeyindeki etki: tarz1 tam, tarz2 yarım (tarzEslesmesi ile aynı pay); kategoriler.
  const butikEtkisi = (b: ProfilButigi, w: number) => {
    ekle(h.tarz, b.tarz1, w);
    ekle(h.tarz, b.tarz2, w * TARZ2_PAYI);
    for (const k of b.kategoriIdleri) ekle(h.kategoriler, k, w);
  };
  // Ürün düzeyindeki etki: yalnız kayıt ve satın almada (spec 2.4: bütçe kaydedilen ürünlerden).
  const urunEtkisi = (k: ProfilKaydi, w: number) => {
    butikEtkisi(k.butik, w);
    ekle(h.segmentler, k.butik.fiyatSegmenti, w);
    ekle(h.etiketler.tur, k.etiket.tur, w);
    ekle(h.etiketler.renk, k.etiket.renk, w);
    ekle(h.etiketler.malzeme, k.etiket.malzeme, w);
  };

  for (const k of g.kayitlar) {
    urunEtkisi(k, PROFIL_AGIRLIK.kayit * azalma(k.kaydedildi, simdi));
    if (k.satinAlindi) urunEtkisi(k, PROFIL_AGIRLIK.satinAlma * azalma(k.satinAlindi, simdi));
  }
  for (const f of g.favoriler) butikEtkisi(f.butik, PROFIL_AGIRLIK.favori * azalma(f.zaman, simdi));
  for (const a of g.butikAcmalari) {
    butikEtkisi(a.butik, PROFIL_AGIRLIK.butikAcma * azalma(a.zaman, simdi));
  }
  for (const s of g.kayitSilmeleri) {
    butikEtkisi(s.butik, PROFIL_AGIRLIK.kayitSilme * azalma(s.zaman, simdi));
  }
  return h;
}

const yuvarla = (x: number) => Math.round(x * 10_000) / 10_000;

/** Sıfır ve altını atar, 0–1 ölçekler, yuvarlar. */
function temizOlcekle(puan: Record<string, number>): ProfilPuanlari {
  const arti = Object.fromEntries(Object.entries(puan).filter(([, p]) => p > 0));
  return Object.fromEntries(
    Object.entries(olcekle(arti))
      .map(([k, p]) => [k, yuvarla(p)] as const)
      .filter(([, p]) => p > 0),
  );
}

/** (1 − pay) × olcekle(test) + pay × olcekle(davranış). Bir taraf boşsa öbürü tam alınır. */
function karistir(
  test: Record<string, number>,
  davranis: Record<string, number>,
  pay: number,
): ProfilPuanlari {
  const t = temizOlcekle(test);
  const d = temizOlcekle(davranis);
  if (Object.keys(d).length === 0) return t;
  if (Object.keys(t).length === 0) return d;
  const sonuc: Record<string, number> = {};
  for (const k of new Set([...Object.keys(t), ...Object.keys(d)])) {
    const p = yuvarla((1 - pay) * (t[k] ?? 0) + pay * (d[k] ?? 0));
    if (p > 0) sonuc[k] = p;
  }
  return sonuc;
}

function ortanca(degerler: number[]): number {
  const s = [...degerler].sort((a, b) => a - b);
  const orta = Math.floor(s.length / 2);
  return s.length % 2 === 1
    ? (s[orta] as number)
    : Math.round(((s[orta - 1] as number) + (s[orta] as number)) / 2);
}

/** Para birimi başına fiyat ortancası. Okunmamış ve pazar para birimi dışındaki fiyatlar girmez. */
function fiyatOrtancalari(kayitlar: ProfilKaydi[]): Record<string, number> {
  const gruplar = new Map<string, number[]>();
  for (const k of kayitlar) {
    const pazar = k.butik.pazarParaBirimi;
    if (!k.fiyat || !pazar || k.fiyat.paraBirimi.toUpperCase() !== pazar.toUpperCase()) continue;
    if (!Number.isFinite(k.fiyat.minor) || k.fiyat.minor <= 0) continue;
    const liste = gruplar.get(pazar.toUpperCase()) ?? [];
    liste.push(k.fiyat.minor);
    gruplar.set(pazar.toUpperCase(), liste);
  }
  return Object.fromEntries([...gruplar].map(([para, liste]) => [para, ortanca(liste)]));
}

export function profilHesapla(g: ProfilGirdileri, simdi: Date): KullaniciProfili {
  const satinAlmaSayisi = g.kayitlar.filter((k) => k.satinAlindi).length;
  const kayitSayisi = g.kayitlar.length + satinAlmaSayisi + g.favoriler.length;
  const bosProfil: KullaniciProfili = {
    tarz: {},
    butce: { segmentler: {}, ortanca: {} },
    kategoriler: {},
    urunEtiketleri: { tur: {}, renk: {}, malzeme: {} },
    yasAraligi: null,
    kayitSayisi,
    kaynak: 'bos',
    guncellendi: simdi,
  };

  // Test yoksa yalnız davranış; ama en az 3 kayıt/favori gerekir (satın alma zaten bir kayıttır).
  if (!g.test && g.kayitlar.length + g.favoriler.length < BOS_ESIGI) return bosProfil;

  const pay = g.test ? davranisPayi(kayitSayisi) : 1;
  const h = hamDavranis(g, simdi);
  const testSegmentleri = Object.fromEntries((g.test?.fiyatSegmentleri ?? []).map((s) => [s, 1]));

  return {
    tarz: karistir(g.test?.tarzPuanlari ?? {}, h.tarz, pay),
    butce: {
      segmentler: karistir(testSegmentleri, h.segmentler, pay),
      ortanca: fiyatOrtancalari(g.kayitlar),
    },
    kategoriler: temizOlcekle(h.kategoriler),
    urunEtiketleri: {
      tur: temizOlcekle(h.etiketler.tur),
      renk: temizOlcekle(h.etiketler.renk),
      malzeme: temizOlcekle(h.etiketler.malzeme),
    },
    yasAraligi: g.test?.yasAraligi ?? null,
    kayitSayisi,
    kaynak: !g.test ? 'davranis' : pay > 0 ? 'karisik' : 'test',
    guncellendi: simdi,
  };
}
