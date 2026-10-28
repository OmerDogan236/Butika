import { BOS_DETAYLI_CEVAP, type DetayliAdim, type DetayliTestCevaplari } from '@butika/types';

// Detaylı testin ekran dışı kuralları (saf işlevler, birim testli).
// Tasarım: docs/superpowers/specs/2026-10-16-detayli-test-tasarim.md (§1, §2)

/** Afiş: kısa testi bitirmiş, detaylı testi doldurmamış ve bu açılışta kapatmamış kişiye. */
export function detayliDavetGorunsunMu(d: {
  kisaTestVar: boolean | undefined;
  detayliVar: boolean | undefined;
  kapatildi: boolean;
}): boolean {
  return d.kisaTestVar === true && d.detayliVar === false && !d.kapatildi;
}

/** Davet penceresi: kuralı sağlıyor VE vitrinde başka bir şey (tur, iskelet, kişisel akış) öne çıkmıyor, ekran odakta. */
export function detayliPencereAcilsinMi(d: {
  gorunsun: boolean;
  turAcik: boolean;
  iskelet: boolean;
  kisiselAdimBekliyor: boolean;
  odakta: boolean;
}): boolean {
  return d.gorunsun && !d.turAcik && !d.iskelet && !d.kisiselAdimBekliyor && d.odakta;
}

export function degistir<T>(liste: T[], deger: T, sinir = Number.POSITIVE_INFINITY): T[] {
  if (liste.includes(deger)) return liste.filter((x) => x !== deger);
  return liste.length >= sinir ? liste : [...liste, deger];
}

export function adimDolu(c: DetayliTestCevaplari, adim: DetayliAdim): boolean {
  switch (adim) {
    case 'cocuk':
      return c.cocuk !== null;
    case 'beden':
      return c.bedenler.length > 0 || c.buyukBeden;
    case 'durumlar':
    case 'urunler':
    case 'renkler':
    case 'degerler':
      return c[adim].length > 0;
    default:
      return c[adim] !== null;
  }
}

export function adimiBosalt(c: DetayliTestCevaplari, adim: DetayliAdim): DetayliTestCevaplari {
  if (adim === 'beden') return { ...c, bedenler: [], buyukBeden: false };
  // Hesaplanan anahtar türü genişletir; değer aynı alanın boş hali olduğu için güvenli.
  return { ...c, [adim]: BOS_DETAYLI_CEVAP[adim] } as DetayliTestCevaplari;
}
