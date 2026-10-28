import { z } from 'zod';

// Desteklenen arayüz dilleri. Yeni dil eklerken buraya ekle + mobil bundle.
export const SUPPORTED_LANGUAGES = ['tr', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'tr';

export const languageSchema = z.enum(SUPPORTED_LANGUAGES);

// ISO 3166-1 alpha-2, büyük harf (TR, US).
export const countryCodeSchema = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'iki büyük harf ISO ülke kodu olmalı');

// ISO ülke kodundan emoji bayrak (regional indicator harfleri). 'TR' → 🇹🇷
export function codeToFlag(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🏳️';
  const base = 0x1f1e6; // regional indicator 'A'
  return String.fromCodePoint(base + (cc.charCodeAt(0) - 65), base + (cc.charCodeAt(1) - 65));
}

// Mobil/istemci pazar gösterimi (GET /countries).
export const marketSchema = z.object({
  code: countryCodeSchema,
  name: z.string().min(1),
  flag: z.string(),
  defaultLanguage: languageSchema,
});
export type Market = z.infer<typeof marketSchema>;

export const countriesResponseSchema = z.object({
  markets: z.array(marketSchema),
  detected: countryCodeSchema.nullable(),
  resolved: countryCodeSchema,
});
export type CountriesResponse = z.infer<typeof countriesResponseSchema>;

// Admin yönetim gösterimi (GET /admin/countries) — pasif pazarlar + sayılar dahil.
export const adminCountrySchema = z.object({
  code: countryCodeSchema,
  name: z.string(),
  flag: z.string(),
  defaultLanguage: languageSchema,
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  boutiqueCount: z.number().int(),
  categoryCount: z.number().int(),
  createdAt: z.string().datetime(),
});
export type AdminCountry = z.infer<typeof adminCountrySchema>;

export const countryCreateSchema = z.object({
  code: countryCodeSchema,
  name: z.string().min(1).max(80),
  defaultLanguage: languageSchema,
});
export type CountryCreate = z.infer<typeof countryCreateSchema>;

export const countryUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  defaultLanguage: languageSchema.optional(),
  isActive: z.boolean().optional(),
});
export type CountryUpdate = z.infer<typeof countryUpdateSchema>;
