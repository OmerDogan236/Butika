import { z } from 'zod';

// Pazar başına vitrin ayarları (admin: "Vitrin ayarları").
export const SECKI_BASLIGI_MAKS = 60;

// "1.2.0" gibi üç parçalı sürüm; boş metin "ayarlanmadı" sayılır.
const surumSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d+\.\d+\.\d+$/.test(v), 'Sürüm 1.2.0 biçiminde olmalı')
  .nullable()
  .transform((v) => v || null);

/** PUT /admin/vitrin-ayarlari/:country gövdesi. Verilmeyen alan değişmez. */
export const vitrinAyarlariGuncelleSchema = z
  .object({
    // Editörün Seçimi şeridinin başlığı; boşsa uygulama kendi metnini gösterir.
    seckiBasligi: z
      .string()
      .trim()
      .max(SECKI_BASLIGI_MAKS)
      .nullable()
      .transform((v) => v || null),
    guncelSurumIos: surumSchema,
    guncelSurumAndroid: surumSchema,
  })
  .partial();
export type VitrinAyarlariGuncelle = z.infer<typeof vitrinAyarlariGuncelleSchema>;

/** GET /vitrin-ayarlari yanıtı (uygulama). */
export interface VitrinAyarlari {
  seckiBasligi: string | null;
  guncelSurum: { ios: string | null; android: string | null };
}

/** GET /admin/vitrin-ayarlari satırı: her aktif pazar için (kayıt yoksa alanlar null). */
export interface AdminVitrinAyari {
  countryCode: string;
  seckiBasligi: string | null;
  guncelSurumIos: string | null;
  guncelSurumAndroid: string | null;
  updatedAt: string | null;
}
