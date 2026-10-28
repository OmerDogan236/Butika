import {
  DETAYLI_ADIMLAR,
  type DetayliAdim,
  type DetayliTestCevaplari,
  type DetayliTestRaporu,
  RAPOR_KUCUK_GRUP,
  detayliTestCevaplariSchema,
} from '@butika/types';
import { type RaporOlayi, dagilim, oran } from './tarz-testi-rapor';

// Admin "Tarz Testi" raporunun "Detaylı test" bölümü. Saf işlevler; kişi bilgisi dışarı verilmez.
// Tasarım: docs/superpowers/specs/2026-10-16-detayli-test-tasarim.md (§6)

/** Bir sorunun cevabı rapor anahtarlarına (çoklu seçimde birden çok). Geçilen soru → []. */
export function raporDegerleri(adim: DetayliAdim, c: DetayliTestCevaplari): string[] {
  switch (adim) {
    case 'cocuk':
      if (!c.cocuk) return [];
      if (!c.cocuk.var) return ['yok'];
      return c.cocuk.yaslar.length > 0 ? [...c.cocuk.yaslar] : ['var'];
    case 'beden':
      return [...c.bedenler, ...(c.buyukBeden ? ['buyuk_beden'] : [])];
    case 'durumlar':
    case 'urunler':
    case 'renkler':
    case 'degerler':
      return [...c[adim]];
    default: {
      const v = c[adim];
      return v ? [v] : [];
    }
  }
}

export function detayliTestRaporu(
  hamCevaplar: unknown[],
  olaylar: RaporOlayi[],
): DetayliTestRaporu {
  const cevaplar = hamCevaplar.flatMap((h) => {
    const s = detayliTestCevaplariSchema.safeParse(h);
    return s.success ? [s.data] : [];
  });
  const kisiler = (eylem: string) =>
    new Set(
      olaylar
        .filter((o) => o.type === 'detayli_davet' && o.payload.eylem === eylem && o.userId)
        .map((o) => o.userId),
    ).size;
  const goren = kisiler('gorundu');
  const tiklayan = kisiler('tiklandi');
  const kapatan = kisiler('kapatildi');
  // Küçük grupta hassas cevapların (tesettür, hamilelik, çocuk) adedi kişiye indirgenebilir.
  const kucukGrup = cevaplar.length < RAPOR_KUCUK_GRUP;
  return {
    dolduran: cevaplar.length,
    davet: {
      goren,
      tiklayan,
      kapatan,
      tiklamaOrani: oran(tiklayan, goren),
      kapatmaOrani: oran(kapatan, goren),
    },
    sorular: DETAYLI_ADIMLAR.map((adim) => ({
      adim,
      dagilim: kucukGrup
        ? []
        : dagilim(
            cevaplar.flatMap((c) => raporDegerleri(adim, c)),
            cevaplar.length,
          ),
    })),
  };
}
