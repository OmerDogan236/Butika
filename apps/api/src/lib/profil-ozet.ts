// Profil sayfasındaki özet hesapları. Saf işlevler: veritabanına dokunmaz, test edilebilir.
// Tasarım: docs/superpowers/specs/2026-09-16-profil-yenileme-tasarim.md

export interface FiyatDususu {
  previousPriceMinor: number | null;
  newPriceMinor: number;
  currency: string;
}

export interface KazancOzeti {
  dususAdedi: number;
  toplamMinor: number;
  /** Kayıtlarda birden çok para birimi varsa null — karışık tutar toplanmaz. */
  paraBirimi: string | null;
}

/** Son 30 günün düşüşlerini toplar. Para birimi karışıksa tutar gösterilmez. */
export function kazanciTopla(dususler: FiyatDususu[]): KazancOzeti {
  const gecerli = dususler.filter(
    (d) => d.previousPriceMinor !== null && d.previousPriceMinor > d.newPriceMinor,
  );
  const paraBirimleri = new Set(gecerli.map((d) => d.currency));
  const toplam = gecerli.reduce(
    (t, d) => t + ((d.previousPriceMinor as number) - d.newPriceMinor),
    0,
  );
  const tek = paraBirimleri.size === 1 ? [...paraBirimleri][0] : null;
  return {
    dususAdedi: gecerli.length,
    toplamMinor: tek ? toplam : 0,
    paraBirimi: tek ?? null,
  };
}

export interface TarzOzeti {
  birincil: string | null;
  ikincil: string | null;
  /** Tarz etiketi olan kaç kayıtlı üründen çıkarıldı. */
  dayanakAdet: number;
}

const TARZ_ASGARI_DAYANAK = 3;

/** Butik tarz etiketlerinden puan: birincil 2, ikincil 1. Öneri puanlamasında kullanılır. */
export function tarzPuanlari(
  butikler: { tarz1: string | null; tarz2: string | null }[],
): Record<string, number> {
  const puan: Record<string, number> = {};
  for (const b of butikler) {
    if (b.tarz1) puan[b.tarz1] = (puan[b.tarz1] ?? 0) + 2;
    if (b.tarz2) puan[b.tarz2] = (puan[b.tarz2] ?? 0) + 1;
  }
  return puan;
}

/**
 * Kullanıcının kayıtlı ürünlerinin butiklerinden tarz çıkarır: birincil etiket 2, ikincil 1
 * puan. Eşitlikte daha çok "birincil" görülen kazanır, o da eşitse alfabetik — sonuç her
 * çağrıda aynı olsun diye.
 */
export function tarziCikar(butikler: { tarz1: string | null; tarz2: string | null }[]): TarzOzeti {
  const puan = new Map<string, { toplam: number; birincil: number }>();
  let dayanak = 0;
  for (const b of butikler) {
    if (!b.tarz1 && !b.tarz2) continue;
    dayanak += 1;
    if (b.tarz1) {
      const m = puan.get(b.tarz1) ?? { toplam: 0, birincil: 0 };
      puan.set(b.tarz1, { toplam: m.toplam + 2, birincil: m.birincil + 1 });
    }
    if (b.tarz2) {
      const m = puan.get(b.tarz2) ?? { toplam: 0, birincil: 0 };
      puan.set(b.tarz2, { toplam: m.toplam + 1, birincil: m.birincil });
    }
  }
  if (dayanak < TARZ_ASGARI_DAYANAK) return { birincil: null, ikincil: null, dayanakAdet: dayanak };
  const sirali = [...puan.entries()].sort(
    (a, b) =>
      b[1].toplam - a[1].toplam || b[1].birincil - a[1].birincil || a[0].localeCompare(b[0], 'tr'),
  );
  return {
    birincil: sirali[0]?.[0] ?? null,
    ikincil: sirali[1]?.[0] ?? null,
    dayanakAdet: dayanak,
  };
}

export interface Rozet {
  anahtar: string;
  kazanildi: boolean;
  ilerleme: number;
  hedef: number;
}

export interface RozetSayimlari {
  kayitliUrun: number;
  koleksiyon: number;
  yorum: number;
  gezilenButik: number;
}

const ROZETLER: { anahtar: string; alan: keyof RozetSayimlari; hedef: number }[] = [
  { anahtar: 'ilkKayit', alan: 'kayitliUrun', hedef: 1 },
  { anahtar: 'onKayit', alan: 'kayitliUrun', hedef: 10 },
  { anahtar: 'yirmiBesKayit', alan: 'kayitliUrun', hedef: 25 },
  { anahtar: 'ilkKoleksiyon', alan: 'koleksiyon', hedef: 1 },
  { anahtar: 'ilkYorum', alan: 'yorum', hedef: 1 },
  { anahtar: 'onButik', alan: 'gezilenButik', hedef: 10 },
];

/** Rozetler sayımlardan hesaplanır; veritabanında rozet tutulmaz. */
export function rozetleriHesapla(sayim: RozetSayimlari): Rozet[] {
  return ROZETLER.map(({ anahtar, alan, hedef }) => {
    const deger = sayim[alan];
    return {
      anahtar,
      kazanildi: deger >= hedef,
      ilerleme: Math.min(deger, hedef),
      hedef,
    };
  });
}
