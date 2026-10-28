import {
  type KullaniciProfiliSatiri,
  type ProfilPuanlari,
  type ProfilUrunEtiketleri,
  kullaniciProfilleri,
} from '@butika/db';
import { eq } from 'drizzle-orm';
import type { TarzProfili } from '../butikcan-catalog';
import { db } from '../db';
import type { ProfilSiraGirdisi } from '../kisisel-siralama';

// Profili kullanmak (aşama 2): vitrinde "Sana özel" ve Butikcan ön elemesi.
// Saf çeviriler + tek okuyucu. Anahtar (PROFIL_VITRIN_ENABLED) çağıran tarafta bakılır.
// Tasarım: docs/superpowers/specs/2026-10-05-kullanici-profili-tasarim.md (§4)

export type KullanilanProfil = Pick<
  KullaniciProfiliSatiri,
  'kaynak' | 'tarz' | 'butce' | 'kategoriler' | 'urunEtiketleri' | 'yasAraligi'
>;

/** Butikcan'da bütçe/ipucu sayılması için gereken en az puan (en yüksek 1). */
const ESIK = 0.5;

/** jsonb alanı beklenmedik biçimdeyse boş sayılır; sıralama hiç hata vermez. */
const puanlar = (x: unknown): ProfilPuanlari =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(
        Object.entries(x as Record<string, unknown>).filter(
          (e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]),
        ),
      )
    : {};

/** Yüksekten düşüğe; eşitlikte ada göre (aynı profil her istekte aynı sonucu versin). */
const sirala = (p: ProfilPuanlari): [string, number][] =>
  Object.entries(p).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'));

export async function profiliOku(userId: string): Promise<KullanilanProfil | null> {
  const [satir] = await db
    .select({
      kaynak: kullaniciProfilleri.kaynak,
      tarz: kullaniciProfilleri.tarz,
      butce: kullaniciProfilleri.butce,
      kategoriler: kullaniciProfilleri.kategoriler,
      urunEtiketleri: kullaniciProfilleri.urunEtiketleri,
      yasAraligi: kullaniciProfilleri.yasAraligi,
    })
    .from(kullaniciProfilleri)
    .where(eq(kullaniciProfilleri.userId, userId))
    .limit(1);
  return satir ?? null;
}

/** Profil var ve boş değil (test, davranış ya da ikisi). */
export function profilDolu(p: KullanilanProfil | null | undefined): boolean {
  return Boolean(p) && p?.kaynak !== 'bos';
}

/**
 * Vitrin/Fırsat sıralama girdisi. Profil yoksa ya da boşsa null: admin sırası.
 * Aşama 3 (sahip şartı): testi olmayan, yalnız davranışla dolu profil de kullanılır.
 */
export function vitrinProfili(p: KullanilanProfil | null | undefined): ProfilSiraGirdisi | null {
  if (!p || !profilDolu(p)) return null;
  return {
    tarz: puanlar(p.tarz),
    butceSegmentleri: puanlar(p.butce?.segmentler),
    yasAraligi: p.yasAraligi ?? null,
    kategoriler: puanlar(p.kategoriler),
  };
}

/**
 * "Önerilen" sıralaması yalnız testi olmayan ve profili davranışla dolu kullanıcıda profile
 * göre dizilir (bugünkü uygulama bu kişilere "Sana özel"i göstermiyor). Testi olan ya da
 * profili boş olan için "Önerilen" admin sırasıdır.
 */
export function onerilendeProfilKullanilir(
  p: KullanilanProfil | null | undefined,
  testVar: boolean,
): boolean {
  return !testVar && p?.kaynak === 'davranis';
}

// Ürün etiketi (packages/types/src/urun-etiketi.ts) → butik adı/açıklamasında aranacak kelimeler.
// Renk kullanılmaz: butik açıklamalarında renk adı anlamlı bir ayrım yapmıyor. 'diger',
// 'aksesuar' gibi genel değerler bilerek yok.
const TUR_KELIMELERI: Record<string, string[]> = {
  elbise: ['elbise'],
  abiye: ['abiye'],
  bluz: ['bluz'],
  gomlek: ['gömlek'],
  tisort: ['tişört'],
  kazak: ['kazak'],
  hirka: ['hırka'],
  sweatshirt: ['sweatshirt'],
  ceket: ['ceket'],
  kaban_mont: ['kaban', 'mont'],
  trenckot: ['trençkot'],
  yelek: ['yelek'],
  pantolon: ['pantolon'],
  jean: ['jean'],
  etek: ['etek'],
  sort: ['şort'],
  takim: ['takım'],
  tulum: ['tulum'],
  esofman: ['eşofman'],
  pijama_ev: ['pijama'],
  ic_giyim: ['iç giyim'],
  mayo_bikini: ['mayo', 'bikini'],
  plaj_giyim: ['plaj'],
  ayakkabi: ['ayakkabı'],
  bot_cizme: ['bot', 'çizme'],
  sandalet_terlik: ['sandalet', 'terlik'],
  canta: ['çanta'],
  sal_esarp: ['şal', 'eşarp'],
  taki: ['takı'],
  gozluk: ['gözlük'],
  parfum: ['parfüm'],
  cilt_bakim: ['cilt bakım'],
  makyaj: ['makyaj'],
  cocuk_bebek: ['çocuk', 'bebek'],
  ev_yasam: ['ev'],
};

const MALZEME_KELIMELERI: Record<string, string[]> = {
  pamuk: ['pamuk'],
  keten: ['keten'],
  ipek: ['ipek'],
  saten: ['saten'],
  yun: ['yün'],
  kasmir: ['kaşmir'],
  triko: ['triko'],
  kadife: ['kadife'],
  deri: ['deri'],
  suet: ['süet'],
  denim: ['denim'],
  sifon: ['şifon'],
  dantel: ['dantel'],
  tul: ['tül'],
  viskon: ['viskon'],
  modal: ['modal'],
  pirlanta: ['pırlanta'],
  hasir: ['hasır'],
};

function enIyiKelimeler(p: unknown, sozluk: Record<string, string[]>): string[] {
  const [ilk] = sirala(puanlar(p)).filter(([k, v]) => v >= ESIK && sozluk[k]);
  return ilk ? (sozluk[ilk[0]] ?? []) : [];
}

/** Profilin en belirgin ürün türü ve malzemesi → arama ipucu kelimeleri. */
export function etiketIpuclari(e: ProfilUrunEtiketleri | null | undefined): string[] {
  if (!e) return [];
  return [
    ...enIyiKelimeler(e.tur, TUR_KELIMELERI),
    ...enIyiKelimeler(e.malzeme, MALZEME_KELIMELERI),
  ];
}

/**
 * Butikcan için tarz profili: ilk iki tarz, puanı ≥ 0.5 olan bütçe segmentleri ve ürün
 * etiketlerinden arama ipuçları. Kullanılacak bir şey yoksa null (çağıran test bilgisine düşer).
 */
export function butikcanProfili(p: KullanilanProfil | null | undefined): TarzProfili | null {
  if (!p || p.kaynak === 'bos') return null;
  const tarzlar = sirala(puanlar(p.tarz)).filter(([, v]) => v > 0);
  const segmentler = sirala(puanlar(p.butce?.segmentler))
    .filter(([, v]) => v >= ESIK)
    .map(([s]) => s);
  if (tarzlar.length === 0 && segmentler.length === 0) return null;
  return {
    tarz1: tarzlar[0]?.[0] ?? null,
    tarz2: tarzlar[1]?.[0] ?? null,
    fiyatSegmentleri: segmentler,
    aramaIpuclari: etiketIpuclari(p.urunEtiketleri),
  };
}
