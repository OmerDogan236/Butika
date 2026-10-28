import { z } from 'zod';
import { TARZLAR, type Tarz } from './boutique';
import type { DetayliAdim } from './detayli-test';

// Tarz testi — soru, şık ve tarz bağlantılarının TEK kaynağı. Mobil ekran bu metinleri
// doğrudan gösterir, sunucu cevapları bu tanıma göre doğrular ve puanlar.
// Bir soru/şık değişirse TEST_SURUMU artırılır; raporda sürümler ayrı tutulur.
// Tasarım: docs/superpowers/specs/2026-09-16-tarz-testi-ve-oneriler-tasarim.md
export const TEST_SURUMU = 1;
export const TEST_SURUMU_KISA = 2;
export const KISA_SENARYO = 'kahvalti' as const;
/** Puanlanabilen test sürümleri (1 = tam, 2 = kısa). */
export const PUANLANABILIR_SURUMLER: readonly number[] = [TEST_SURUMU, TEST_SURUMU_KISA];
export const HEPSI = 'hepsi';

export const FIYAT_SEGMENTLERI = ['uygun', 'orta', 'yuksek', 'luks'] as const;
export type FiyatSegmenti = (typeof FIYAT_SEGMENTLERI)[number];

export const YAS_ARALIKLARI = ['18_24', '25_34', '35_44', '45_54', '55_plus'] as const;
export type YasAraligi = (typeof YAS_ARALIKLARI)[number];

export const RENKLER = [
  'notr_toprak',
  'siyah_beyaz',
  'pastel',
  'canli',
  'koyu',
  'desenli',
] as const;
export type Renk = (typeof RENKLER)[number];

export interface SenaryoSikki {
  anahtar: string;
  etiket: string;
  ana: Tarz | null;
  ikinci: Tarz | null;
}

export interface SenaryoSorusu {
  anahtar: 'kahvalti' | 'davet' | 'ayakkabi';
  soru: string;
  siklar: SenaryoSikki[];
}

const sik = (
  anahtar: string,
  etiket: string,
  ana: Tarz | null,
  ikinci: Tarz | null = null,
): SenaryoSikki => ({
  anahtar,
  etiket,
  ana,
  ikinci,
});

export const SENARYO_SORULARI: SenaryoSorusu[] = [
  {
    anahtar: 'kahvalti',
    soru: 'Hafta sonu kahvaltıya çıkıyorsun, üzerinde ne var?',
    siklar: [
      sik('beyaz_tisort', 'Beyaz tişört, iyi kesim bir pantolon', 'minimal', 'sade şık'),
      sik('keten_elbise', 'Keten elbise, hasır çanta', 'bohem', 'romantik'),
      sik('kot_sweatshirt', 'Kot, sweatshirt, rahat ne varsa', 'günlük'),
      sik('esofman_ceket', 'Eşofman altı, sneaker, üstüne şık bir ceket', 'spor şık', 'sokak'),
      sik('anne_ceketi', 'Annemin dolabından çıkma bir ceket', 'vintage'),
      sik('goz_alici_renk', 'Göz alıcı renkte tek bir parça', 'cesur'),
      sik(HEPSI, 'Moduma göre hepsi olabiliyor :)', null),
    ],
  },
  {
    anahtar: 'davet',
    soru: 'Bir davete gidiyorsun, hangisi sen?',
    siklar: [
      sik('siyah_sade', 'Siyah, sade, iyi kesim', 'minimal', 'sade şık'),
      sik('ucusan_cicekli', 'Uçuşan, çiçekli', 'romantik', 'bohem'),
      sik('dikkat_ceken', 'Dikkat çeken bir renk ya da kesim', 'cesur'),
      sik('donem_esintili', 'Eski dönem esintili bir parça', 'vintage'),
    ],
  },
  {
    anahtar: 'ayakkabi',
    soru: 'Hangi ayakkabı sana daha çok benziyor?',
    siklar: [
      sik('sneaker', 'Sneaker', 'sokak', 'günlük'),
      sik('loafer', 'Loafer', 'sade şık', 'minimal'),
      sik('espadril_sandalet', 'Espadril ya da sandalet', 'bohem'),
      sik('babet', 'Babet', 'romantik', 'vintage'),
      sik('iddiali_bot_topuklu', 'İddialı bir bot ya da topuklu', 'cesur'),
    ],
  },
];

export const TARZ_SORUSU = 'Hangi tarzlar sana yakın?';
export const FIYAT_SORUSU = 'Bir parçaya genelde ne kadar harcarsın?';
export const YAS_SORUSU = 'Kaç yaşındasın?';
export const RENK_SORUSU = 'Dolabında hangi renkler çoğunlukta?';

export const TARZ_ACIKLAMALARI: Record<Tarz, string> = {
  minimal: 'Az parça, temiz çizgiler, sade renkler',
  'sade şık': 'Her ortama uyan, zamansız ve özenli parçalar',
  günlük: 'Rahat, kolay kombinlenen her gün parçaları',
  bohem: 'Salaş kesimler, doğal dokular, desenler',
  romantik: 'Fırfır, dantel, akışkan ve kadınsı detaylar',
  sokak: 'Oversize, sneaker, rahat ve iddialı şehir stili',
  vintage: 'Eski dönemlerden ilham, retro kesim ve desenler',
  'spor şık': 'Spor rahatlığı, şık parçalarla bir arada',
  cesur: 'Dikkat çeken renkler, sıra dışı kesimler',
};

export const FIYAT_ETIKETLERI: Record<FiyatSegmenti, string> = {
  uygun: "1.000 TL'ye kadar",
  orta: '1.000 – 5.000 TL',
  yuksek: '5.000 – 10.000 TL',
  luks: '10.000 TL üstü',
};

export const YAS_ETIKETLERI: Record<YasAraligi, string> = {
  '18_24': '18–24',
  '25_34': '25–34',
  '35_44': '35–44',
  '45_54': '45–54',
  '55_plus': '55+',
};

export const RENK_ETIKETLERI: Record<Renk, string> = {
  notr_toprak: 'Nötr ve toprak tonları',
  siyah_beyaz: 'Siyah-beyaz',
  pastel: 'Pastel',
  canli: 'Canlı renkler',
  koyu: 'Koyu tonlar',
  desenli: 'Desenli',
};

const benzersiz = <T>(dizi: T[]) => new Set(dizi).size === dizi.length;

const senaryoSikKontrolu =
  (anahtarlar: readonly string[]) => (senaryo: Record<string, string[]>, ctx: z.RefinementCtx) => {
    for (const anahtar of Object.keys(senaryo)) {
      if (!anahtarlar.includes(anahtar))
        ctx.addIssue({ code: 'custom', message: `bilinmeyen soru: ${anahtar}` });
    }
    for (const soru of SENARYO_SORULARI.filter((s) => anahtarlar.includes(s.anahtar))) {
      const secilen = senaryo[soru.anahtar];
      if (!secilen) continue;
      const gecerli = new Set(soru.siklar.map((s) => s.anahtar));
      if (!benzersiz(secilen))
        ctx.addIssue({ code: 'custom', message: `tekrarlı şık: ${soru.anahtar}` });
      for (const s of secilen) {
        if (!gecerli.has(s))
          ctx.addIssue({ code: 'custom', message: `bilinmeyen şık: ${soru.anahtar}.${s}` });
      }
    }
  };

const tamTarzTestiSchema = z
  .object({
    testSurumu: z.literal(TEST_SURUMU),
    senaryo: z.record(z.string(), z.array(z.string()).min(1)),
    acikTarzlar: z.array(z.enum(TARZLAR)).min(1).max(3).refine(benzersiz, 'tekrarlı tarz'),
    fiyatSegmentleri: z.array(z.enum(FIYAT_SEGMENTLERI)).max(4).refine(benzersiz, 'tekrarlı fiyat'),
    renkler: z.array(z.enum(RENKLER)).max(3).refine(benzersiz, 'tekrarlı renk'),
  })
  .superRefine((v, ctx) => {
    const beklenen = new Set(SENARYO_SORULARI.map((s) => s.anahtar as string));
    for (const anahtar of Object.keys(v.senaryo)) {
      if (!beklenen.has(anahtar))
        ctx.addIssue({ code: 'custom', message: `bilinmeyen soru: ${anahtar}` });
    }
    for (const soru of SENARYO_SORULARI) {
      const secilen = v.senaryo[soru.anahtar];
      if (!secilen) {
        ctx.addIssue({ code: 'custom', message: `cevapsız soru: ${soru.anahtar}` });
        continue;
      }
      const gecerliSiklar = new Set(soru.siklar.map((s) => s.anahtar));
      if (!benzersiz(secilen))
        ctx.addIssue({ code: 'custom', message: `tekrarlı şık: ${soru.anahtar}` });
      for (const s of secilen) {
        if (!gecerliSiklar.has(s))
          ctx.addIssue({ code: 'custom', message: `bilinmeyen şık: ${soru.anahtar}.${s}` });
      }
    }
  });

export const kisaTarzTestiSchema = z
  .object({
    testSurumu: z.literal(TEST_SURUMU_KISA),
    senaryo: z.record(z.string(), z.array(z.string()).min(1)),
    acikTarzlar: z.array(z.enum(TARZLAR)).max(3).refine(benzersiz, 'tekrarlı tarz'),
    fiyatSegmentleri: z.array(z.enum(FIYAT_SEGMENTLERI)).max(4).refine(benzersiz, 'tekrarlı fiyat'),
    renkler: z.array(z.enum(RENKLER)).max(0),
    yasAraligi: z.enum(YAS_ARALIKLARI).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    senaryoSikKontrolu([KISA_SENARYO])(v.senaryo, ctx);
    const bos =
      Object.keys(v.senaryo).length === 0 &&
      v.acikTarzlar.length === 0 &&
      v.fiyatSegmentleri.length === 0 &&
      !v.yasAraligi;
    if (bos) ctx.addIssue({ code: 'custom', message: 'en az bir cevap gerekli' });
  });

export const tarzTestiGonderSchema = z.union([tamTarzTestiSchema, kisaTarzTestiSchema]);
export type TarzTestiGonder = z.infer<typeof tarzTestiGonderSchema>;

export interface SonTarzTesti {
  testSurumu: number;
  senaryo: Record<string, string[]>;
  acikTarzlar: Tarz[];
  fiyatSegmentleri: FiyatSegmenti[];
  renkler: Renk[];
  yasAraligi: YasAraligi | null;
  tarz1: Tarz | null;
  tarz2: Tarz | null;
  createdAt: string;
}

export interface OneriYaniti {
  oneriId: string | null;
  items: { id: string; name: string; coverImageUrl: string }[];
}

// ─── Admin raporu ────────────────────────────────────────────────────────────
export const RAPOR_KUCUK_GRUP = 5;

/** oran: yüzde, tek ondalık; grup RAPOR_KUCUK_GRUP'tan küçükse null ("yetersiz veri"). */
export interface Oran {
  anahtar: string;
  adet: number;
  oran: number | null;
}

/** Katılım sayıları (kişi). yarida = başlatan − bitiren − hepsiniAtlayan. */
export interface KatilimSayilari {
  baslatan: number;
  bitiren: number;
  /** Son soruya kadar her adımı atlayıp cevapsız bitiren (yalnız kısa test, sürüm 2). */
  hepsiniAtlayan: number;
  /** Son soruya gelmeden çıkan. Güncelleme akışındaki "Daha sonra" da buradadır (olayı sunucuya gelmez). */
  yarida: number;
}

export interface KatilimSurumu extends KatilimSayilari {
  testSurumu: number;
  /** Yarıda kalanlar; anahtar: geçilen son adım ("0" = hiç adım geçilmedi). Adım adları sürüme göre. */
  birakilanAdim: Oran[];
  /** Testin açıldığı yere göre (yalnız kısa test olayında kaynak var). Kişi birden çok yerde olabilir. */
  kaynaga: (KatilimSayilari & { kaynak: string })[];
}

export interface DetayliTestRaporu {
  /** Aralıkta detaylı testi kaydeden/güncelleyen kişi. */
  dolduran: number;
  /** Afiş: gören / tıklayan / kapatan kişi sayısı. */
  davet: { goren: number; tiklayan: number; kapatan: number; tiklamaOrani: number | null; kapatmaOrani: number | null };
  sorular: { adim: DetayliAdim; dagilim: Oran[] }[];
}

export interface TarzTestiRaporu {
  range: '1d' | '7d' | '30d' | '90d';
  katilim: {
    baslatan: number;
    bitiren: number;
    /** Sürüm başına (en yeni önce): v1 (uzun) ve v2 (kısa) ayrı. */
    surumler: KatilimSurumu[];
    gunluk: { gun: string; baslatan: number; bitiren: number }[];
  };
  /** Kısa testteki (sürüm 2) yaş sorusu; kisi = sürüm 2 ile son testi olan kişi. */
  yas: { kisi: number; dagilim: Oran[] };
  tarz: {
    kisi: number;
    dagilim: Oran[];
    esnekOrani: number | null;
    soylenenSecilen: { tarz: string; kisi: number; senaryo: Oran[] }[];
    favoriOrtusme: { kisi: number; oran: number | null };
  };
  fiyatRenk: {
    fiyat: Oran[];
    fiyatTarza: { tarz: string; kisi: number; fiyat: Oran[] }[];
    /** Renk yalnız uzun testte (sürüm 1) sorulur; oran o kişilere göre. */
    renk: Oran[];
  };
  oneri: {
    gosterim: number;
    tiklama: number;
    kaydetme: number;
    tiklamaOrani: number | null;
    kaydetmeOrani: number | null;
    sirayaGore: Oran[];
    eslesmeyeGore: { eslesme: string; gosterilen: number; tiklanan: number; oran: number | null }[];
    enCokTiklanan: { butikId: string; ad: string; adet: number }[];
  };
  senaryo: { testSurumu: number; soru: string; kisi: number; siklar: Oran[] }[];
  detayli: DetayliTestRaporu;
}
