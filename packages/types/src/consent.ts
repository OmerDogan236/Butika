import { z } from 'zod';

// Rıza türleri — her biri ayrı kaydedilir.
export const consentTypeSchema = z.enum([
  'kvkk_acik_riza',
  'ticari_ileti',
  'cerez_analitik',
  // Butikcan: sohbet + beden bilgisinin yapay zekâ sağlayıcısına (Google Gemini) iletilmesi.
  'yapay_zeka_aktarim',
]);
export type ConsentType = z.infer<typeof consentTypeSchema>;

// Rızanın hangi akıştan geldiği.
export const consentSourceSchema = z.enum([
  'web_butik_formu',
  'web_quiz',
  'web_cerez',
  'mobil_kayit',
  'mobil_butikcan',
]);
export type ConsentSource = z.infer<typeof consentSourceSchema>;

// Ortak /consent endpoint'ine gönderilen paket (web + mobil ortak kullanır).
// IP ve User-Agent İSTEMCİDEN alınmaz — sunucu header'dan kendisi okur.
export const consentSubmitSchema = z
  .object({
    email: z.string().email().max(254).optional(),
    userId: z.string().uuid().optional(),
    visitorId: z.string().max(128).optional(),
    source: consentSourceSchema,
    textVersion: z.string().min(1).max(20), // örn 'v1'
    locale: z.enum(['tr', 'en']).optional(),
    consents: z
      .array(
        z.object({
          type: consentTypeSchema,
          granted: z.boolean(),
        }),
      )
      .min(1)
      .max(10),
  })
  // En az bir "kime ait" bilgisi olmalı (e-posta / kullanıcı / anonim ziyaretçi).
  .refine((d) => Boolean(d.email || d.userId || d.visitorId), {
    message: 'email, userId veya visitorId gerekli',
  });

export type ConsentSubmit = z.infer<typeof consentSubmitSchema>;
