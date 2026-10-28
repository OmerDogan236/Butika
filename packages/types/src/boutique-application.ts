import { z } from 'zod';

// Landing page butik başvuru formundan gelen veri — doğrulama kuralları.
export const boutiqueApplicationCreateSchema = z.object({
  boutiqueName: z.string().min(2).max(120), // Butik Adı (zorunlu)
  city: z.string().min(1).max(80), // Şehir (zorunlu)
  contactName: z.string().min(2).max(120), // İsim Soyisim (zorunlu)
  phone: z.string().min(5).max(40), // Telefon (zorunlu)
  email: z.string().email().max(254), // E-posta (zorunlu, geçerli olmalı)
  website: z.string().max(300).optional(), // Website veya Instagram (opsiyonel)
  description: z.string().max(2000).optional(), // Butik hakkında (opsiyonel)
});

export type BoutiqueApplicationCreate = z.infer<typeof boutiqueApplicationCreateSchema>;
