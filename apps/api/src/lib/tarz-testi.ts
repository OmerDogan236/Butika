import {
  HEPSI,
  PUANLANABILIR_SURUMLER,
  SENARYO_SORULARI,
  TARZLAR,
  type Tarz,
  type TarzTestiGonder,
} from '@butika/types';

// Tarz testi sonucu. Saf işlev: veritabanına dokunmaz.
// Açık seçim +3; senaryo şıkkı ana +2·w, ikinci +1·w. w = 1/|seçilen şık|;
// "hepsi" ile birlikte seçildiyse w = 0.5/|şık|; yalnız "hepsi" puan vermez.
// Tasarım: docs/superpowers/specs/2026-09-16-tarz-testi-ve-oneriler-tasarim.md

export type TarzPuanlari = Partial<Record<Tarz, number>>;

export interface TestSonucu {
  puanlar: TarzPuanlari;
  tarz1: Tarz | null;
  tarz2: Tarz | null;
  senaryoTarz1: Tarz | null;
  senaryoTarz2: Tarz | null;
  esnek: boolean;
}

const ESIK = 1e-9;

function ekle(puanlar: TarzPuanlari, tarz: Tarz | null, deger: number) {
  if (!tarz || deger <= 0) return;
  puanlar[tarz] = (puanlar[tarz] ?? 0) + deger;
}

/** En yüksek iki tarz. Beraberlikte önce `oncelikli` kümesindekiler, sonra TARZLAR sırası. */
export function ilkIkiTarz(
  puanlar: TarzPuanlari,
  oncelikli: ReadonlySet<string> = new Set(),
): [Tarz | null, Tarz | null] {
  const sirali = TARZLAR.filter((t) => (puanlar[t] ?? 0) > ESIK).sort((a, b) => {
    const fark = (puanlar[b] ?? 0) - (puanlar[a] ?? 0);
    if (Math.abs(fark) > ESIK) return fark;
    const oncelik = Number(oncelikli.has(b)) - Number(oncelikli.has(a));
    if (oncelik !== 0) return oncelik;
    return TARZLAR.indexOf(a) - TARZLAR.indexOf(b);
  });
  return [sirali[0] ?? null, sirali[1] ?? null];
}

export function testSonucunuHesapla(
  cevap: Pick<TarzTestiGonder, 'senaryo' | 'acikTarzlar'>,
): TestSonucu {
  const senaryoPuanlari: TarzPuanlari = {};
  let esnek = false;

  for (const soru of SENARYO_SORULARI) {
    const secilen = cevap.senaryo[soru.anahtar] ?? [];
    const hepsi = secilen.includes(HEPSI);
    const siklar = soru.siklar.filter((s) => s.anahtar !== HEPSI && secilen.includes(s.anahtar));
    if (hepsi) esnek = true;
    if (siklar.length === 0) continue;
    const w = (hepsi ? 0.5 : 1) / siklar.length;
    for (const s of siklar) {
      ekle(senaryoPuanlari, s.ana, 2 * w);
      ekle(senaryoPuanlari, s.ikinci, 1 * w);
    }
  }

  const puanlar: TarzPuanlari = { ...senaryoPuanlari };
  for (const t of cevap.acikTarzlar) ekle(puanlar, t, 3);

  const [tarz1, tarz2] = ilkIkiTarz(puanlar, new Set(cevap.acikTarzlar));
  const [senaryoTarz1, senaryoTarz2] = ilkIkiTarz(senaryoPuanlari);
  return { puanlar, tarz1, tarz2, senaryoTarz1, senaryoTarz2, esnek };
}

/** Veritabanındaki test satırının puanlamaya gereken alanları. */
export interface KayitliTest {
  testSurumu: number;
  senaryoCevaplari: Record<string, string[]>;
  acikTarzlar: string[];
  tarz1: string | null;
  tarz2: string | null;
}

/** Kayıttaki cevaptan tarz puanları. Eski test sürümünde yalnız sonuç etiketlerine dayanılır. */
export function kayittanTestPuanlari(s: KayitliTest): Record<string, number> {
  if (PUANLANABILIR_SURUMLER.includes(s.testSurumu)) {
    return testSonucunuHesapla({
      senaryo: s.senaryoCevaplari,
      acikTarzlar: s.acikTarzlar as Tarz[],
    }).puanlar as Record<string, number>;
  }
  const puan: Record<string, number> = {};
  if (s.tarz1) puan[s.tarz1] = 2;
  if (s.tarz2) puan[s.tarz2] = 1;
  return puan;
}
