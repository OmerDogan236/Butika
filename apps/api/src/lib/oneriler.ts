import { FIYAT_SEGMENTLERI } from '@butika/types';

// "Sana önerilen butikler" puanlaması. Saf işlev: veritabanına dokunmaz.
// Tasarım: docs/superpowers/specs/2026-09-16-tarz-testi-ve-oneriler-tasarim.md (bölüm 3)

export const ONERI_ADEDI = 10;
const ESNEK_TARZ_SINIRI = 3;

export const AGIRLIK = { test: 3, favori: 1.5, fiyatTam: 2, fiyatKomsu: 0.5, kategori: 1 } as const;
/** Butiğin ikinci tarzı (tarz2) birincinin yarısı kadar sayılır. Profil hesabı da bunu kullanır. */
export const TARZ2_PAYI = 0.5;

export interface OneriAdayi {
  id: string;
  name: string;
  coverImageUrl: string;
  tarz1: string | null;
  tarz2: string | null;
  fiyatSegmenti: string | null;
  /** kategoriId → o kategorideki admin sırası */
  kategoriSiralari: Record<string, number>;
  createdAt: Date;
}

export interface OneriGirdisi {
  /** Son testin ham tarz puanları; test yoksa null. */
  testPuanlari: Record<string, number> | null;
  /** Favorilerden çıkan ham tarz puanları (tarzPuanlari). */
  favoriPuanlari: Record<string, number>;
  fiyatSegmentleri: string[];
  /** Favori butiklerin kategorileri ∪ onboarding kategorileri. */
  ilgiKategorileri: ReadonlySet<string>;
  /** Telefonun gönderdiği sırayla onboarding kategorileri (yedek liste için). */
  onboardingKategorileri: string[];
  esnek: boolean;
  /** Kullanıcının kayıtlı ürünü olan butikler. */
  haricButikler: ReadonlySet<string>;
}

export type Eslesme = 'test' | 'favori' | 'fiyat' | 'kategori' | 'onboarding';

export interface Oneri {
  id: string;
  name: string;
  coverImageUrl: string;
  puan: number;
  eslesme: Eslesme;
}

/** En yüksek puan 1 olacak şekilde ölçekler. */
export function olcekle(puanlar: Record<string, number> | null): Record<string, number> {
  if (!puanlar) return {};
  const enYuksek = Math.max(0, ...Object.values(puanlar));
  if (enYuksek <= 0) return {};
  return Object.fromEntries(Object.entries(puanlar).map(([t, p]) => [t, p / enYuksek]));
}

export function tarzEslesmesi(
  a: Pick<OneriAdayi, 'tarz1' | 'tarz2'>,
  v: Record<string, number>,
): number {
  return (a.tarz1 ? (v[a.tarz1] ?? 0) : 0) + TARZ2_PAYI * (a.tarz2 ? (v[a.tarz2] ?? 0) : 0);
}

export function fiyatPuani(a: Pick<OneriAdayi, 'fiyatSegmenti'>, secilen: string[]): number {
  if (secilen.length === 0 || !a.fiyatSegmenti) return 0;
  const i = FIYAT_SEGMENTLERI.indexOf(a.fiyatSegmenti as (typeof FIYAT_SEGMENTLERI)[number]);
  if (i === -1) return 0;
  let enIyi = 0;
  for (const s of secilen) {
    const j = FIYAT_SEGMENTLERI.indexOf(s as (typeof FIYAT_SEGMENTLERI)[number]);
    if (j === i) return AGIRLIK.fiyatTam;
    if (Math.abs(j - i) === 1) enIyi = AGIRLIK.fiyatKomsu;
  }
  return enIyi;
}

const enKucukSira = (a: OneriAdayi) =>
  Math.min(Number.POSITIVE_INFINITY, ...Object.values(a.kategoriSiralari));

function siraKarsilastir(a: OneriAdayi, b: OneriAdayi): number {
  return (
    enKucukSira(a) - enKucukSira(b) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

function onboardingYedegi(adaylar: OneriAdayi[], girdi: OneriGirdisi, adet: number): Oneri[] {
  const listeler = girdi.onboardingKategorileri.map((k) =>
    adaylar
      .filter((a) => k in a.kategoriSiralari && !girdi.haricButikler.has(a.id))
      .sort(
        (a, b) =>
          (a.kategoriSiralari[k] ?? 0) - (b.kategoriSiralari[k] ?? 0) || siraKarsilastir(a, b),
      ),
  );
  const secilen: Oneri[] = [];
  const goruldu = new Set<string>();
  for (let tur = 0; secilen.length < adet && listeler.some((l) => l.length > tur); tur++) {
    for (const liste of listeler) {
      const a = liste[tur];
      if (!a || goruldu.has(a.id)) continue;
      goruldu.add(a.id);
      secilen.push({
        id: a.id,
        name: a.name,
        coverImageUrl: a.coverImageUrl,
        puan: 0,
        eslesme: 'onboarding',
      });
      if (secilen.length === adet) break;
    }
  }
  return secilen;
}

export function onerileriSec(
  adaylar: OneriAdayi[],
  girdi: OneriGirdisi,
  adet = ONERI_ADEDI,
): Oneri[] {
  const favoriVar = Object.keys(girdi.favoriPuanlari).length > 0;
  if (!girdi.testPuanlari && !favoriVar) return onboardingYedegi(adaylar, girdi, adet);

  const v = olcekle(girdi.testPuanlari);
  const f = olcekle(girdi.favoriPuanlari);

  const puanli = adaylar
    .filter((a) => !girdi.haricButikler.has(a.id))
    .map((a) => {
      const parcalar: [Eslesme, number][] = [
        ['test', AGIRLIK.test * tarzEslesmesi(a, v)],
        ['favori', AGIRLIK.favori * tarzEslesmesi(a, f)],
        ['fiyat', fiyatPuani(a, girdi.fiyatSegmentleri)],
        [
          'kategori',
          Object.keys(a.kategoriSiralari).some((k) => girdi.ilgiKategorileri.has(k))
            ? AGIRLIK.kategori
            : 0,
        ],
      ];
      const puan = parcalar.reduce((t, [, p]) => t + p, 0);
      // Eşitlikte dizideki ilk ölçüt kazanır (test > favori > fiyat > kategori).
      const eslesme = parcalar.reduce((en, p) => (p[1] > en[1] ? p : en))[0];
      return { a, puan, eslesme };
    })
    .filter((x) => x.puan > 0)
    .sort((x, y) => y.puan - x.puan || siraKarsilastir(x.a, y.a));

  const secilen: Oneri[] = [];
  const tarzSayisi = new Map<string, number>();
  for (const { a, puan, eslesme } of puanli) {
    if (secilen.length === adet) break;
    if (girdi.esnek && a.tarz1) {
      const n = tarzSayisi.get(a.tarz1) ?? 0;
      if (n >= ESNEK_TARZ_SINIRI) continue;
      tarzSayisi.set(a.tarz1, n + 1);
    }
    secilen.push({
      id: a.id,
      name: a.name,
      coverImageUrl: a.coverImageUrl,
      puan,
      eslesme,
    });
  }

  return secilen.length > 0 ? secilen : onboardingYedegi(adaylar, girdi, adet);
}
