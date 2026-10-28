import {
  type KatilimSayilari,
  type KatilimSurumu,
  type Oran,
  PUANLANABILIR_SURUMLER,
  RAPOR_KUCUK_GRUP,
  SENARYO_SORULARI,
  TARZLAR,
  TEST_SURUMU,
  TEST_SURUMU_KISA,
  type TarzTestiRaporu,
} from '@butika/types';

// Admin "Tarz Testi" raporunun hesapları. Saf işlevler; kişi bilgisi dışarı verilmez.
// Tasarım: docs/superpowers/specs/2026-09-16-tarz-testi-ve-oneriler-tasarim.md (bölüm 5),
// kısa test (sürüm 2) ayrımı: docs/superpowers/specs/2026-10-01-kisisel-butika-tasarim.md (§2)

export interface RaporCevabi {
  userId: string;
  testSurumu: number;
  senaryo: Record<string, string[]>;
  acikTarzlar: string[];
  fiyatSegmentleri: string[];
  renkler: string[];
  yasAraligi: string | null;
  tarz1: string | null;
  senaryoTarz1: string | null;
  favoriTarz1: string | null;
  esnek: boolean;
  createdAt: Date;
}

export interface RaporOlayi {
  userId: string | null;
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/** Yüzde, tek ondalık. Grup küçükse null. */
export function oran(adet: number, toplam: number): number | null {
  if (toplam < RAPOR_KUCUK_GRUP) return null;
  return Math.round((adet / toplam) * 1000) / 10;
}

export function dagilim(degerler: (string | null | undefined)[], toplamKisi: number): Oran[] {
  const sayim = new Map<string, number>();
  for (const d of degerler) if (d) sayim.set(d, (sayim.get(d) ?? 0) + 1);
  return [...sayim.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
    .map(([anahtar, adet]) => ({ anahtar, adet, oran: oran(adet, toplamKisi) }));
}

export function kisiBasinaSon(cevaplar: RaporCevabi[]): RaporCevabi[] {
  const son = new Map<string, RaporCevabi>();
  for (const c of cevaplar) {
    const onceki = son.get(c.userId);
    if (!onceki || c.createdAt > onceki.createdAt) son.set(c.userId, c);
  }
  return [...son.values()];
}

const gunu = (d: Date) => d.toISOString().slice(0, 10);

// Kısa testin (sürüm 2) adım sayısı: son adıma gelip kayıt bırakmayan her adımı atlamıştır
// (en az bir cevap varsa uygulama gönderir; gönderim hatası telefonda bekleyip sonra gelir).
const KISA_ADIM_SAYISI = 4;
// Olay payload'ı istemciden gelir: yalnız bilinen sürüm ve kaynaklar rapora girer.
const BILINEN_KAYNAKLAR = new Set([
  'onboarding',
  'guncelleme',
  'vitrin_karti',
  'siralama_menusu',
  'ayarlar',
  'profil',
]);
// Eski (1.1.0) istemci tarz_testi_basladi'ya testSurumu: 1 koyar; yoksa 1 sayılır.
const olaySurumu = (o: RaporOlayi) =>
  o.payload.testSurumu === undefined ? TEST_SURUMU : Number(o.payload.testSurumu);

function katilimSurumu(
  testSurumu: number,
  cevaplar: RaporCevabi[],
  olaylar: RaporOlayi[],
): KatilimSurumu {
  const bitirenler = new Set(
    cevaplar.filter((c) => c.testSurumu === testSurumu).map((c) => c.userId),
  );
  const baslatanlar = new Set(bitirenler);
  const sonAdim = new Map<string, number>();
  const kaynaktan = new Map<string, Set<string>>();
  for (const o of olaylar) {
    if (!o.userId || olaySurumu(o) !== testSurumu) continue;
    if (o.type === 'tarz_testi_basladi') {
      baslatanlar.add(o.userId);
      const kaynak = String(o.payload.kaynak);
      if (BILINEN_KAYNAKLAR.has(kaynak)) {
        const k = kaynaktan.get(kaynak) ?? new Set<string>();
        k.add(o.userId);
        kaynaktan.set(kaynak, k);
      }
    } else if (o.type === 'tarz_testi_adim') {
      const adim = Number(o.payload.adim) || 0;
      sonAdim.set(o.userId, Math.max(sonAdim.get(o.userId) ?? 0, adim));
    }
  }

  const atladi = (u: string) =>
    testSurumu === TEST_SURUMU_KISA &&
    !bitirenler.has(u) &&
    (sonAdim.get(u) ?? 0) >= KISA_ADIM_SAYISI;
  const sayilar = (kisiler: Set<string>): KatilimSayilari => {
    const liste = [...kisiler];
    const bitiren = liste.filter((u) => bitirenler.has(u)).length;
    const hepsiniAtlayan = liste.filter(atladi).length;
    return {
      baslatan: liste.length,
      bitiren,
      hepsiniAtlayan,
      yarida: liste.length - bitiren - hepsiniAtlayan,
    };
  };

  const yaridaKalanlar = [...baslatanlar].filter((u) => !bitirenler.has(u) && !atladi(u));
  return {
    testSurumu,
    ...sayilar(baslatanlar),
    birakilanAdim: dagilim(
      yaridaKalanlar.map((u) => String(sonAdim.get(u) ?? 0)),
      yaridaKalanlar.length,
    ),
    kaynaga: [...kaynaktan.entries()]
      .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
      .map(([kaynak, kisiler]) => ({ kaynak, ...sayilar(kisiler) })),
  };
}

export function katilimRaporu(
  cevaplar: RaporCevabi[],
  olaylar: RaporOlayi[],
): TarzTestiRaporu['katilim'] {
  const bitirenler = new Set(cevaplar.map((c) => c.userId));
  const baslatanlar = new Set(bitirenler);
  const gunluk = new Map<string, { baslatan: Set<string>; bitiren: number }>();
  const gunKaydi = (g: string) => {
    const k = gunluk.get(g) ?? { baslatan: new Set<string>(), bitiren: 0 };
    gunluk.set(g, k);
    return k;
  };

  for (const o of olaylar) {
    if (!o.userId || o.type !== 'tarz_testi_basladi') continue;
    baslatanlar.add(o.userId);
    gunKaydi(gunu(o.createdAt)).baslatan.add(o.userId);
  }
  for (const c of cevaplar) gunKaydi(gunu(c.createdAt)).bitiren += 1;

  // Sürümler ayrı: adım numaraları ve "yarıda" anlamı sürüme göre değişir.
  const surumler = PUANLANABILIR_SURUMLER.filter(
    (v) =>
      cevaplar.some((c) => c.testSurumu === v) ||
      olaylar.some((o) => o.userId && o.type === 'tarz_testi_basladi' && olaySurumu(o) === v),
  ).sort((a, b) => b - a);

  return {
    baslatan: baslatanlar.size,
    bitiren: bitirenler.size,
    surumler: surumler.map((v) => katilimSurumu(v, cevaplar, olaylar)),
    gunluk: [...gunluk.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([g, k]) => ({ gun: g, baslatan: k.baslatan.size, bitiren: k.bitiren })),
  };
}

/** Kısa testteki yaş sorusu: kişi başına son test sürüm 2 olanlar arasında. */
export function yasRaporu(son: RaporCevabi[]): TarzTestiRaporu['yas'] {
  const kisa = son.filter((s) => s.testSurumu === TEST_SURUMU_KISA);
  return {
    kisi: kisa.length,
    dagilim: dagilim(
      kisa.map((s) => s.yasAraligi),
      kisa.length,
    ),
  };
}

export function tarzRaporu(son: RaporCevabi[]): TarzTestiRaporu['tarz'] {
  const favorili = son.filter((s) => s.favoriTarz1);
  return {
    kisi: son.length,
    dagilim: dagilim(
      son.map((s) => s.tarz1),
      son.length,
    ),
    esnekOrani: oran(son.filter((s) => s.esnek).length, son.length),
    soylenenSecilen: TARZLAR.map((tarz) => {
      const grup = son.filter((s) => s.acikTarzlar.includes(tarz));
      return {
        tarz,
        kisi: grup.length,
        senaryo: dagilim(
          grup.map((s) => s.senaryoTarz1),
          grup.length,
        ),
      };
    }).filter((g) => g.kisi > 0),
    favoriOrtusme: {
      kisi: favorili.length,
      oran: oran(favorili.filter((s) => s.favoriTarz1 === s.tarz1).length, favorili.length),
    },
  };
}

export function fiyatRenkRaporu(son: RaporCevabi[]): TarzTestiRaporu['fiyatRenk'] {
  const tarzlar = [...new Set(son.map((s) => s.tarz1).filter((t): t is string => !!t))];
  return {
    fiyat: dagilim(
      son.flatMap((s) => s.fiyatSegmentleri),
      son.length,
    ),
    fiyatTarza: tarzlar.map((tarz) => {
      const grup = son.filter((s) => s.tarz1 === tarz);
      return {
        tarz,
        kisi: grup.length,
        fiyat: dagilim(
          grup.flatMap((s) => s.fiyatSegmentleri),
          grup.length,
        ),
      };
    }),
    // Renk yalnız uzun testte sorulur; kısa test yapanlar paydayı düşürmesin.
    renk: dagilim(
      son.flatMap((s) => s.renkler),
      son.filter((s) => s.testSurumu === TEST_SURUMU).length,
    ),
  };
}

type OneriOgesi = { butikId: string; sira: number; eslesme: string };

export function oneriRaporu(olaylar: RaporOlayi[]): Omit<
  TarzTestiRaporu['oneri'],
  'enCokTiklanan'
> & {
  enCokTiklanan: { butikId: string; adet: number }[];
} {
  const listeler = new Map<string, OneriOgesi[]>();
  const gosterilen = new Map<string, number>();
  const tiklanan = new Map<string, number>();
  const butikTiklama = new Map<string, number>();
  const siralar: string[] = [];
  let gosterim = 0;
  let tiklama = 0;
  let kaydetme = 0;

  for (const o of olaylar) {
    if (o.type !== 'oneri_gosterildi') continue;
    const items = (o.payload.items as OneriOgesi[] | undefined) ?? [];
    listeler.set(String(o.payload.oneriId), items);
    gosterim += 1;
    for (const i of items) gosterilen.set(i.eslesme, (gosterilen.get(i.eslesme) ?? 0) + 1);
  }
  for (const o of olaylar) {
    if (o.type === 'product_saved' && o.payload.kaynak === 'oneri') kaydetme += 1;
    if (o.type !== 'oneri_tiklandi') continue;
    // Tıklama, yalnızca aynı olay kümesindeki bilinen bir oneri_gosterildi
    // listesine ve o listede yer alan bir butikId'ye atıfta bulunuyorsa
    // sayılır. sira ve eslesme her zaman sunucunun yazdığı liste öğesinden
    // alınır; istemcinin payload'daki sira/eslesme değerleri asla
    // güvenilmez (sahte veriyle rapor şişirilebilir/uuid dışı id sızabilir).
    const butikId = String(o.payload.butikId);
    const oge = listeler.get(String(o.payload.oneriId))?.find((i) => i.butikId === butikId);
    if (!oge) continue;
    tiklama += 1;
    siralar.push(String(oge.sira));
    butikTiklama.set(butikId, (butikTiklama.get(butikId) ?? 0) + 1);
    tiklanan.set(oge.eslesme, (tiklanan.get(oge.eslesme) ?? 0) + 1);
  }

  return {
    gosterim,
    tiklama,
    kaydetme,
    tiklamaOrani: oran(tiklama, gosterim),
    kaydetmeOrani: oran(kaydetme, gosterim),
    sirayaGore: dagilim(siralar, tiklama),
    eslesmeyeGore: [...gosterilen.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([eslesme, g]) => ({
        eslesme,
        gosterilen: g,
        tiklanan: tiklanan.get(eslesme) ?? 0,
        oran: oran(tiklanan.get(eslesme) ?? 0, g),
      })),
    enCokTiklanan: [...butikTiklama.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([butikId, adet]) => ({ butikId, adet })),
  };
}

export function senaryoRaporu(son: RaporCevabi[]): TarzTestiRaporu['senaryo'] {
  const surumler = [...new Set(son.map((s) => s.testSurumu))].sort((a, b) => b - a);
  return surumler.flatMap((testSurumu) => {
    const grup = son.filter((s) => s.testSurumu === testSurumu);
    const sorular = [
      ...new Set([
        ...SENARYO_SORULARI.map((s) => s.anahtar as string),
        ...grup.flatMap((g) => Object.keys(g.senaryo)),
      ]),
    ];
    return sorular
      .map((soru) => {
        const cevaplayan = grup.filter((g) => g.senaryo[soru]);
        return {
          testSurumu,
          soru,
          kisi: cevaplayan.length,
          siklar: dagilim(
            cevaplayan.flatMap((g) => g.senaryo[soru] ?? []),
            cevaplayan.length,
          ),
        };
      })
      .filter((s) => s.kisi > 0);
  });
}
