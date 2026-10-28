import { z } from 'zod';

export const siparisDurumuSchema = z.enum([
  'odenmedi',
  'hazirlaniyor',
  'kargoda',
  'teslim',
  'iptal',
]);

export const siparisSatiriSchema = z.object({
  ad: z.string(),
  adet: z.number().int(),
  gorsel: z.string().nullable(),
  urunUrl: z.string().nullable(),
});

// "Satın Aldıklarım": bağlı butiklerden otomatik okunan siparişler.
export const butikSiparisiSchema = z.object({
  id: z.string().uuid(),
  butikAdi: z.string(),
  boutiqueId: z.string().uuid(),
  siparisNo: z.string(),
  siparisAt: z.string().datetime(),
  durum: siparisDurumuSchema,
  satirlar: z.array(siparisSatiriSchema),
  tutarMinor: z.number().int(),
  currency: z.string(),
  kargoFirmasi: z.string().nullable(),
  takipNo: z.string().nullable(),
  takipUrl: z.string().nullable(),
  iadePolitikasi: z.string().nullable(),
  butikUrl: z.string(),
});
export type ButikSiparisi = z.infer<typeof butikSiparisiSchema>;

export const siparislerYanitiSchema = z.object({
  pilot: z.boolean(),
  siparisler: z.array(butikSiparisiSchema),
});
export type SiparislerYaniti = z.infer<typeof siparislerYanitiSchema>;
