import { z } from 'zod';

// Detaylı test — soru, şık ve alanların TEK kaynağı. Mobil ekran bu metinleri doğrudan
// gösterir, sunucu cevapları bu şemayla doğrular. Bir soru/şık değişirse
// DETAYLI_TEST_SURUMU artırılır.
// Tasarım: docs/superpowers/specs/2026-10-16-detayli-test-tasarim.md
export const DETAYLI_TEST_SURUMU = 1;

export const COCUK_YASLARI = ['0_2', '3_6', '7_12', '13_plus'] as const;
export const COCUK_CINSIYETLERI = ['kiz', 'erkek', 'ikisi'] as const;
export const TESETTUR_CEVAPLARI = ['evet', 'bazen', 'hayir'] as const;
export const HAMILE_CEVAPLARI = ['evet', 'hayir'] as const;
export const DURUMLAR = ['gunluk', 'is', 'davet', 'tatil', 'spor', 'ozel_gun'] as const;
export const DETAYLI_URUNLER = [
  'giyim',
  'abiye',
  'mayo',
  'ic_giyim',
  'ayakkabi',
  'canta',
  'taki',
  'guzellik',
  'ev_giyimi',
] as const;
export const BEDENLER = ['xs', 's', 'm', 'l', 'xl', 'xxl'] as const;
export const DETAYLI_RENKLER = ['notr', 'siyah', 'pastel', 'canli'] as const;
export const KUMASLAR = ['dogal', 'fark_etmez'] as const;
export const DEGERLER = ['yerli', 'el_yapimi', 'surdurulebilir', 'vintage'] as const;

export type CocukYasi = (typeof COCUK_YASLARI)[number];
export type Durum = (typeof DURUMLAR)[number];
export type DetayliUrun = (typeof DETAYLI_URUNLER)[number];

export const DURUM_SINIRI = 3;
export const RENK_SINIRI = 2;
export const BEDEN_SINIRI = 3;

export const DETAYLI_ADIMLAR = [
  'cocuk',
  'tesettur',
  'hamile',
  'durumlar',
  'urunler',
  'beden',
  'renkler',
  'kumas',
  'degerler',
] as const;
export type DetayliAdim = (typeof DETAYLI_ADIMLAR)[number];

export const DETAYLI_SORULAR: Record<DetayliAdim, string> = {
  cocuk: 'Çocuğun var mı?',
  tesettur: 'Tesettür butikleri ilgini çeker mi?',
  hamile: 'Hamile giyim butikleri ilgini çeker mi?',
  durumlar: 'En çok hangi durumlar için alışveriş yaparsın?',
  urunler: 'Hangi ürünlere bakarsın?',
  beden:
    'Sana daha iyi önerilerde bulunabilmemiz için beden aralığını bizimle paylaşmak ister misin?',
  renkler: 'Renklerde tercihin?',
  kumas: 'Kumaş tercihin?',
  degerler: 'Senin için neler önemli?',
};
export const COCUK_YAS_SORUSU = 'Kaç yaşında?';
export const COCUK_CINSIYET_SORUSU = 'Kız mı, erkek mi?';
export const BUYUK_BEDEN_ETIKETI = 'Büyük beden butiklerini de görmek isterim';

export const COCUK_VAR_ETIKETLERI = { yok: 'Yok', var: 'Var' } as const;
export const COCUK_YAS_ETIKETLERI: Record<CocukYasi, string> = {
  '0_2': '0–2 yaş',
  '3_6': '3–6 yaş',
  '7_12': '7–12 yaş',
  '13_plus': '13 yaş ve üstü',
};
export const COCUK_CINSIYET_ETIKETLERI: Record<(typeof COCUK_CINSIYETLERI)[number], string> = {
  kiz: 'Kız',
  erkek: 'Erkek',
  ikisi: 'İkisi de',
};
export const TESETTUR_ETIKETLERI: Record<(typeof TESETTUR_CEVAPLARI)[number], string> = {
  evet: 'Evet',
  bazen: 'Bazen',
  hayir: 'Hayır',
};
export const HAMILE_ETIKETLERI: Record<(typeof HAMILE_CEVAPLARI)[number], string> = {
  evet: 'Evet',
  hayir: 'Hayır',
};
export const DURUM_ETIKETLERI: Record<Durum, string> = {
  gunluk: 'Günlük',
  is: 'İş',
  davet: 'Davet ve düğün',
  tatil: 'Tatil ve plaj',
  spor: 'Spor',
  ozel_gun: 'Özel gün',
};
export const DETAYLI_URUN_ETIKETLERI: Record<DetayliUrun, string> = {
  giyim: 'Giyim',
  abiye: 'Abiye',
  mayo: 'Mayo',
  ic_giyim: 'İç giyim',
  ayakkabi: 'Ayakkabı',
  canta: 'Çanta',
  taki: 'Takı',
  guzellik: 'Güzellik ve parfüm',
  ev_giyimi: 'Ev giyimi',
};
export const BEDEN_ETIKETLERI: Record<(typeof BEDENLER)[number], string> = {
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL',
  xxl: 'XXL',
};
export const DETAYLI_RENK_ETIKETLERI: Record<(typeof DETAYLI_RENKLER)[number], string> = {
  notr: 'Nötr tonlar',
  siyah: 'Siyah ağırlıklı',
  pastel: 'Pastel',
  canli: 'Canlı renkler',
};
export const KUMAS_ETIKETLERI: Record<(typeof KUMASLAR)[number], string> = {
  dogal: 'Doğal kumaşlar (keten, pamuk, ipek)',
  fark_etmez: 'Fark etmez',
};
export const DEGER_ETIKETLERI: Record<(typeof DEGERLER)[number], string> = {
  yerli: 'Yerli tasarım',
  el_yapimi: 'El yapımı',
  surdurulebilir: 'Sürdürülebilir üretim',
  vintage: 'Vintage',
};

function secimDizisi<T extends readonly [string, ...string[]]>(degerler: T, enCok: number) {
  return z
    .array(z.enum(degerler))
    .max(enCok)
    .refine((d) => new Set(d).size === d.length, 'tekrarlı seçim');
}

const cocukSchema = z
  .object({
    var: z.boolean(),
    yaslar: secimDizisi(COCUK_YASLARI, COCUK_YASLARI.length),
    cinsiyet: z.enum(COCUK_CINSIYETLERI).nullable(),
  })
  .strict()
  .refine((c) => c.var || (c.yaslar.length === 0 && c.cinsiyet === null), 'çocuk yok + ayrıntı');

/** Her alan "Geç" ile boş kalabilir: tekli → null, çoklu → []. */
export const detayliTestCevaplariSchema = z
  .object({
    cocuk: cocukSchema.nullable(),
    tesettur: z.enum(TESETTUR_CEVAPLARI).nullable(),
    hamile: z.enum(HAMILE_CEVAPLARI).nullable(),
    durumlar: secimDizisi(DURUMLAR, DURUM_SINIRI),
    urunler: secimDizisi(DETAYLI_URUNLER, DETAYLI_URUNLER.length),
    bedenler: secimDizisi(BEDENLER, BEDEN_SINIRI),
    buyukBeden: z.boolean(),
    renkler: secimDizisi(DETAYLI_RENKLER, RENK_SINIRI),
    kumas: z.enum(KUMASLAR).nullable(),
    degerler: secimDizisi(DEGERLER, DEGERLER.length),
  })
  .strict();
export type DetayliTestCevaplari = z.infer<typeof detayliTestCevaplariSchema>;

export const detayliTestGonderSchema = z.object({
  testSurumu: z.literal(DETAYLI_TEST_SURUMU),
  cevaplar: detayliTestCevaplariSchema,
});
export type DetayliTestGonder = z.infer<typeof detayliTestGonderSchema>;

export interface DetayliTest {
  testSurumu: number;
  cevaplar: DetayliTestCevaplari;
  guncellendi: string;
}

export const BOS_DETAYLI_CEVAP: DetayliTestCevaplari = {
  cocuk: null,
  tesettur: null,
  hamile: null,
  durumlar: [],
  urunler: [],
  bedenler: [],
  buyukBeden: false,
  renkler: [],
  kumas: null,
  degerler: [],
};

const ETIKET_TABLOSU: Record<DetayliAdim, Record<string, string>> = {
  // Rapor anahtarları: 'yok', 'var' (yaş belirtilmedi) ya da yaş aralığı.
  cocuk: { ...COCUK_YAS_ETIKETLERI, yok: 'Çocuğu yok', var: 'Var (yaş belirtmedi)' },
  tesettur: TESETTUR_ETIKETLERI,
  hamile: HAMILE_ETIKETLERI,
  durumlar: DURUM_ETIKETLERI,
  urunler: DETAYLI_URUN_ETIKETLERI,
  beden: { ...BEDEN_ETIKETLERI, buyuk_beden: BUYUK_BEDEN_ETIKETI },
  renkler: DETAYLI_RENK_ETIKETLERI,
  kumas: KUMAS_ETIKETLERI,
  degerler: DEGER_ETIKETLERI,
};

/** Admin raporunda bir cevap anahtarının görünen adı. */
export function detayliEtiket(adim: DetayliAdim, anahtar: string): string {
  return ETIKET_TABLOSU[adim][anahtar] ?? anahtar;
}
