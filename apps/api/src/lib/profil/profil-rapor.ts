import type { KullaniciProfiliSatiri } from '@butika/db';
import {
  type ProfilListeSatiri,
  type ProfilRaporu,
  type ProfilUyumu,
  RAPOR_KUCUK_GRUP,
  type VitrinAcmaSatiri,
} from '@butika/types';
import { TARZ2_PAYI } from '../oneriler';
import { type RaporOlayi, dagilim, oran } from '../tarz-testi-rapor';
import { BOS_ESIGI } from './profil-hesapla';

// Admin "Kullanıcı Profilleri" raporunun hesapları. Saf işlevler; veritabanına dokunmaz.
// Kişi kısa kimlikle görünür; isim/e-posta yalnız çağıran verirse (ayar açıkken) eklenir.
// Tasarım: docs/superpowers/specs/2026-10-05-kullanici-profili-tasarim.md (§5)

export type RaporProfili = Pick<
  KullaniciProfiliSatiri,
  | 'userId'
  | 'kaynak'
  | 'tarz'
  | 'butce'
  | 'kategoriler'
  | 'yasAraligi'
  | 'kayitSayisi'
  | 'guncellendi'
>;

/** Bu puanın altındaki bütçe segmenti ve kategori "ilgi" sayılmaz (en yüksek 1). */
const ILGI_ESIGI = 0.5;
const KATEGORI_ADEDI = 10;
const LISTE_ILGI_ADEDI = 3;

/** Yüksekten düşüğe; eşitlikte ada göre. Bozuk jsonb boş sayılır. */
function sirali(p: unknown): [string, number][] {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return [];
  return Object.entries(p as Record<string, unknown>)
    .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'));
}

const ilki = (p: unknown): string | null => sirali(p)[0]?.[0] ?? null;

export function profilOzeti(profiller: RaporProfili[]): ProfilRaporu['ozet'] {
  const dolu = profiller.filter((p) => p.kaynak !== 'bos');
  const kategoriler = dagilim(
    dolu.flatMap((p) =>
      sirali(p.kategoriler)
        .filter(([, v]) => v >= ILGI_ESIGI)
        .map(([k]) => k),
    ),
    dolu.length,
  ).slice(0, KATEGORI_ADEDI);
  return {
    profil: profiller.length,
    dolu: dolu.length,
    kaynak: dagilim(
      profiller.map((p) => p.kaynak),
      profiller.length,
    ),
    tarz: dagilim(
      dolu.map((p) => ilki(p.tarz)),
      dolu.length,
    ),
    butce: dagilim(
      dolu.map((p) => ilki(p.butce?.segmentler)),
      dolu.length,
    ),
    yas: dagilim(
      dolu.map((p) => p.yasAraligi),
      dolu.length,
    ),
    kategoriler,
  };
}

export interface FarkKaydi {
  tarz1: string | null;
  tarz2: string | null;
  fiyatSegmenti: string | null;
}

export interface FarkKisisi {
  test: { tarz1: string | null; tarz2: string | null; fiyatSegmentleri: string[] } | null;
  kayitlar: FarkKaydi[];
}

const enYuksek = (sayim: Map<string, number>): string | null =>
  [...sayim.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))[0]?.[0] ??
  null;

/** Kayıtlı ürünlerin butiklerinden birinci tarz (tarz1 tam, tarz2 yarım). Zamanla azalma yok. */
export function davranisTarzi(kayitlar: FarkKaydi[]): string | null {
  const sayim = new Map<string, number>();
  for (const k of kayitlar) {
    if (k.tarz1) sayim.set(k.tarz1, (sayim.get(k.tarz1) ?? 0) + 1);
    if (k.tarz2) sayim.set(k.tarz2, (sayim.get(k.tarz2) ?? 0) + TARZ2_PAYI);
  }
  return enYuksek(sayim);
}

export function enSikSegment(kayitlar: FarkKaydi[]): string | null {
  const sayim = new Map<string, number>();
  for (const k of kayitlar) {
    if (k.fiyatSegmenti) sayim.set(k.fiyatSegmenti, (sayim.get(k.fiyatSegmenti) ?? 0) + 1);
  }
  return enYuksek(sayim);
}

const uyum = (kisi: number, uyusan: number): ProfilUyumu => ({
  kisi,
  uyusan,
  oran: oran(uyusan, kisi),
});

/**
 * Test ile davranış farkı: testi ve en az BOS_ESIGI kaydı olan kullanıcılar. Davranışın birinci
 * tarzı testin tarz1/tarz2'sindeyse tarz uyuşur; kayıtların en sık segmenti testte seçilen
 * segmentlerdeyse bütçe uyuşur (iki tarafta da segment yoksa bütçe karşılaştırılmaz).
 */
export function testDavranisFarki(kisiler: FarkKisisi[]): ProfilRaporu['fark'] {
  let tarzKisi = 0;
  let tarzUyusan = 0;
  let butceKisi = 0;
  let butceUyusan = 0;
  for (const { test, kayitlar } of kisiler) {
    if (!test || kayitlar.length < BOS_ESIGI) continue;
    const tarz = davranisTarzi(kayitlar);
    const testTarzlari = [test.tarz1, test.tarz2].filter(Boolean);
    if (tarz && testTarzlari.length > 0) {
      tarzKisi += 1;
      if (testTarzlari.includes(tarz)) tarzUyusan += 1;
    }
    const segment = enSikSegment(kayitlar);
    if (segment && test.fiyatSegmentleri.length > 0) {
      butceKisi += 1;
      if (test.fiyatSegmentleri.includes(segment)) butceUyusan += 1;
    }
  }
  return { tarz: uyum(tarzKisi, tarzUyusan), butce: uyum(butceKisi, butceUyusan) };
}

/** Listede bir satır. kimlik yalnız PROFIL_RAPOR_KIMLIK_GOSTER açıkken verilir. */
export function profilListeSatiri(
  p: RaporProfili,
  kategoriAdi: ReadonlyMap<string, string>,
  kimlik?: { ad: string | null; eposta: string | null },
): ProfilListeSatiri {
  return {
    kisaKimlik: p.userId.slice(0, 8),
    ...(kimlik ? { ad: kimlik.ad, eposta: kimlik.eposta } : {}),
    kaynak: p.kaynak,
    tarzlar: sirali(p.tarz)
      .slice(0, 2)
      .map(([t]) => t),
    butce: sirali(p.butce?.segmentler)
      .filter(([, v]) => v >= ILGI_ESIGI)
      .map(([s]) => s),
    ortanca: p.butce?.ortanca ?? {},
    ilgiAlanlari: sirali(p.kategoriler)
      .slice(0, LISTE_ILGI_ADEDI)
      .map(([k]) => kategoriAdi.get(k) ?? k),
    kayitSayisi: p.kayitSayisi,
    guncellendi: p.guncellendi.toISOString(),
  };
}

const VITRIN_SIRALAMALARI = ['kisisel', 'onerilen'] as const;

/**
 * Vitrinden butik açma, sıralamaya göre (boutique_view: kaynak = vitrin, siralama 1.2.1'den
 * beri yükte). Gerçek oran için kart gösterimi gerekir (yalnız PostHog'da); burada kişi başına.
 */
export function vitrinAcmaRaporu(olaylar: RaporOlayi[]): VitrinAcmaSatiri[] {
  return VITRIN_SIRALAMALARI.map((siralama) => {
    const ilgili = olaylar.filter(
      (o) =>
        o.type === 'boutique_view' &&
        o.userId &&
        o.payload.kaynak === 'vitrin' &&
        o.payload.siralama === siralama,
    );
    const kisi = new Set(ilgili.map((o) => o.userId)).size;
    return {
      siralama,
      kisi,
      acma: ilgili.length,
      kisiBasina: kisi < RAPOR_KUCUK_GRUP ? null : Math.round((ilgili.length / kisi) * 10) / 10,
    };
  });
}
