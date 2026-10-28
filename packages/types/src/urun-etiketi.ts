// packages/types/src/urun-etiketi.ts
import { z } from 'zod';

// Kaydedilen ürünün adından çıkarılan etiketler. Sözlük dışı değer kabul edilmez;
// yeni değer eklemek serbest, var olanı silmek ya da yeniden adlandırmak YASAK
// (veritabanındaki eski etiketler anlamsızlaşır).
export const URUN_TURLERI = [
  'elbise', 'abiye', 'bluz', 'gomlek', 'tisort', 'kazak', 'hirka', 'sweatshirt', 'ceket', 'kaban_mont',
  'trenckot', 'yelek', 'pantolon', 'jean', 'etek', 'sort', 'takim', 'tulum', 'esofman', 'pijama_ev',
  'ic_giyim', 'mayo_bikini', 'plaj_giyim', 'ayakkabi', 'bot_cizme', 'sandalet_terlik', 'canta',
  'sal_esarp', 'taki', 'aksesuar', 'gozluk', 'parfum', 'cilt_bakim', 'makyaj', 'cocuk_bebek',
  'ev_yasam', 'diger',
] as const;

export const URUN_RENKLERI = [
  'siyah', 'beyaz', 'ekru_krem', 'bej', 'kahverengi', 'gri', 'lacivert', 'mavi', 'yesil', 'haki',
  'kirmizi', 'bordo', 'pembe', 'mor', 'turuncu', 'sari', 'altin', 'gumus', 'desenli', 'cok_renkli',
] as const;

export const URUN_MALZEMELERI = [
  'pamuk', 'keten', 'ipek', 'saten', 'yun', 'kasmir', 'triko', 'kadife', 'deri', 'suet', 'denim',
  'sifon', 'dantel', 'tul', 'viskon', 'polyester', 'modal', 'altin', 'gumus', 'pirlanta', 'hasir',
] as const;

export const urunEtiketiSchema = z
  .object({
    tur: z.enum(URUN_TURLERI),
    renk: z.enum(URUN_RENKLERI).nullable(),
    malzeme: z.enum(URUN_MALZEMELERI).nullable(),
  })
  .strict();

export type UrunEtiketi = z.infer<typeof urunEtiketiSchema>;
