import { z } from 'zod';
import { countryCodeSchema } from './country';

export const boutiqueSchema = z.object({
  id: z.string().uuid(),
  countryCode: countryCodeSchema,
  categoryIds: z.array(z.string().uuid()).min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(400),
  url: z.string().url(),
  coverImageUrl: z.string().url(),
  logoUrl: z.string().url().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
});

export type Boutique = z.infer<typeof boutiqueSchema>;

// Editörün Seçimi — vitrinin üstündeki elle seçilmiş şerit. Admin yazar, uygulama yalnız
// editorNotu'nu görür (sıra ve işaret yanıta konmaz; liste zaten sıralı gelir).
export const EDITOR_NOTU_MAKS = 140;
export const editorAlanlariSchema = z.object({
  editorSecimi: z.boolean(),
  // Elle sıra: küçük önce; boş olanlar sona, aralarında ada göre.
  editorSirasi: z.number().int().min(0).max(9999).nullable(),
  // Boş metin "not yok" sayılır.
  editorNotu: z
    .string()
    .trim()
    .max(EDITOR_NOTU_MAKS)
    .nullable()
    .transform((v) => v || null),
});

// Fırsat sekmesi — "Hangi butiklerde indirim var?" listesi. Editörün Seçimi ile aynı
// kurgu: uygulama yalnız firsatNotu'nu görür (işaret ve sıra yanıta konmaz).
export const FIRSAT_NOTU_MAKS = 140;
export const firsatAlanlariSchema = z.object({
  firsat: z.boolean(),
  // Elle sıra: küçük önce; boş olanlar sona, aralarında ada göre.
  firsatSirasi: z.number().int().min(0).max(9999).nullable(),
  // Kısa indirim notu ("%30'a varan sezon sonu"); boş metin "not yok" sayılır.
  firsatNotu: z
    .string()
    .trim()
    .max(FIRSAT_NOTU_MAKS)
    .nullable()
    .transform((v) => v || null),
});

export const boutiqueCreateSchema = boutiqueSchema
  .omit({ id: true, createdAt: true })
  .partial({ logoUrl: true, isActive: true, sortOrder: true })
  .merge(editorAlanlariSchema.partial())
  .merge(firsatAlanlariSchema.partial());
export const boutiqueUpdateSchema = boutiqueCreateSchema.partial();

/** GET /boutiques/editorun-secimi satırı: vitrin kartının alanları + editör notu. */
export type EditorunSecimiButigi = Omit<Boutique, 'isActive'> & {
  categoryId: string | null;
  editorNotu: string | null;
};

/** GET /boutiques/firsatlar satırı: vitrin kartının alanları + indirim notu. */
export type FirsatButigi = Omit<Boutique, 'isActive'> & {
  categoryId: string | null;
  firsatNotu: string | null;
};

// Kapalı tarz sözlüğü — butika_tarz.py'deki TARZLAR ile birebir aynı olmalı.
export const TARZLAR = [
  'minimal',
  'sade şık',
  'günlük',
  'bohem',
  'romantik',
  'sokak',
  'vintage',
  'spor şık',
  'cesur',
] as const;
export type Tarz = (typeof TARZLAR)[number];

// Kategori grubuna özel etiketler — TARZDAN AYRI.
//
// Tarz sözlüğü giyim içindir ve kullanıcının tarz testiyle eşleştirilir. Güzellik,
// parfüm gibi grupların etiketleri oraya karışırsa testte kullanıcıya bir giyim
// tarzı gibi görünür ve öneri eşleşmesini bozar. Bu etiketler yalnız arama ve
// Butikcan bağlamı içindir; tarz testine hiç girmez.
//
// Sözlükler: docs/analiz/tarz-sozlugu-onerileri.md
export const GUZELLIK_ETIKETLERI = [
  'doğal içerik',
  'etkin bakım',
  'niş parfüm',
  'günlük makyaj',
  'lüks bakım',
] as const;

/** Şimdilik tek grup dolu; iç giyim, eşarp gibi gruplar sırayla eklenecek. */
export const BUTIK_ETIKETLERI = [...GUZELLIK_ETIKETLERI] as const;
export type ButikEtiketi = (typeof BUTIK_ETIKETLERI)[number];

export const ETIKET_ACIKLAMALARI: Record<ButikEtiketi, string> = {
  'doğal içerik': 'Organik, vegan, bitkisel; sade formüller',
  'etkin bakım': 'Serum, asit, dermatolojik; sonuç odaklı ürünler',
  'niş parfüm': 'Özel üretim koku evleri, sıra dışı notalar',
  'günlük makyaj': 'Erişilebilir renk kozmetiği, gündelik kullanım',
  'lüks bakım': 'Üst segment, ritüel vurgusu, hediyelik sunum',
};

/** Bilinmeyen etiketleri eler — dışarıdan gelen veri doğrudan yazılmaz. */
export function gecerliEtiketler(girdi: unknown): ButikEtiketi[] {
  if (!Array.isArray(girdi)) return [];
  const gecerli = new Set<string>(BUTIK_ETIKETLERI);
  return Array.from(
    new Set(girdi.filter((e): e is ButikEtiketi => typeof e === 'string' && gecerli.has(e))),
  );
}
