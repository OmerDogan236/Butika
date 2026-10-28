import { z } from 'zod';

// Admin "Bildirimler": elle planlanan duyuru bildirimleri.
export const BILDIRIM_BASLIK_MAKS = 60;
export const BILDIRIM_METIN_MAKS = 180;

export const BILDIRIM_KITLELERI = ['all', 'savers'] as const;
export type BildirimKitlesi = (typeof BILDIRIM_KITLELERI)[number];

export const BILDIRIM_DURUMLARI = [
  'taslak',
  'planlandi',
  'gonderiliyor',
  'gonderildi',
  'iptal',
  'gecikti',
  'hata',
] as const;
export type BildirimDurumu = (typeof BILDIRIM_DURUMLARI)[number];

// Bildirime dokununca uygulamada ne açılsın. null: yalnız uygulama açılır (eski davranış).
// guncelleme: mağazadaki uygulama sayfası (iOS App Store / Google Play).
// butik:<id> butik sayfası, kategori:<id> vitrinde o kategori. Eski uygulama sürümleri
// bu alanı bilmez, yalnız uygulamayı açar.
export const BILDIRIM_SABIT_HEDEFLER = ['vitrin', 'firsat', 'butikcan', 'guncelleme'] as const;
export type BildirimSabitHedef = (typeof BILDIRIM_SABIT_HEDEFLER)[number];
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const HEDEF_KALIBI = new RegExp(
  `^(${BILDIRIM_SABIT_HEDEFLER.join('|')}|(butik|kategori):${UUID})$`,
);

export type BildirimHedefi =
  | { tur: BildirimSabitHedef }
  | { tur: 'butik'; id: string }
  | { tur: 'kategori'; id: string };

/** "butik:<id>" gibi saklanan değeri çözer; geçersizse null. */
export function bildirimHedefiCoz(deger: string | null | undefined): BildirimHedefi | null {
  if (!deger || !HEDEF_KALIBI.test(deger)) return null;
  const [tur, id] = deger.split(':');
  if (tur === 'butik' || tur === 'kategori') return { tur, id: id as string };
  return { tur: tur as BildirimSabitHedef };
}

const hedef = z
  .string()
  .regex(HEDEF_KALIBI, 'Geçersiz hedef')
  .nullable()
  .transform((v) => v ?? null);

const baslik = z
  .string()
  .trim()
  .min(1, 'Başlık boş olamaz')
  .max(BILDIRIM_BASLIK_MAKS, `Başlık en fazla ${BILDIRIM_BASLIK_MAKS} karakter`);
const metin = z
  .string()
  .trim()
  .min(1, 'Metin boş olamaz')
  .max(BILDIRIM_METIN_MAKS, `Metin en fazla ${BILDIRIM_METIN_MAKS} karakter`);
// ISO zaman; admin formu Türkiye saatini "+03:00" ile gönderir.
const zaman = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Geçersiz gönderim zamanı');

/** POST /admin/bildirimler gövdesi. Taslak onay bekler; planlandi zamanı gelince gider. */
export const bildirimOlusturSchema = z.object({
  baslik,
  metin,
  kitle: z.enum(BILDIRIM_KITLELERI).default('all'),
  gonderimZamani: zaman,
  durum: z.enum(['taslak', 'planlandi']).default('taslak'),
  hedef: hedef.default(null),
});
export type BildirimOlustur = z.infer<typeof bildirimOlusturSchema>;

/** PATCH /admin/bildirimler/:id — yalnız taslak/planlandi iken. Verilmeyen alan değişmez. */
export const bildirimGuncelleSchema = z
  .object({
    baslik,
    metin,
    kitle: z.enum(BILDIRIM_KITLELERI),
    gonderimZamani: zaman,
    durum: z.enum(['taslak', 'planlandi', 'iptal']),
    hedef,
  })
  .partial();
export type BildirimGuncelle = z.infer<typeof bildirimGuncelleSchema>;

/** GET /admin/bildirimler satırı. */
export interface AdminBildirimPlani {
  id: string;
  baslik: string;
  metin: string;
  kitle: BildirimKitlesi;
  gonderimZamani: string;
  durum: BildirimDurumu;
  /** Dokununca ne açılır ("butik:<id>" vb.); null: yalnız uygulama. */
  hedef: string | null;
  /** Hedef butik/kategori ise adı (listede göstermek için); yoksa null. */
  hedefAdi: string | null;
  /** PostHog'daki kampanya adı (push_opened.campaign). */
  kampanya: string;
  aliciSayisi: number | null;
  basarili: number | null;
  hatali: number | null;
  gonderildiAt: string | null;
  createdAt: string;
}

/** GET /admin/bildirimler/kitle — şu an kaç kişiye/cihaza gider. */
export interface AdminBildirimKitleSayilari {
  all: { kisi: number; cihaz: number };
  savers: { kisi: number; cihaz: number };
}

/** Planın PostHog kampanya adı: "admin-" + id'nin ilk 8 hanesi. */
export function bildirimKampanyasi(id: string): string {
  return `admin-${id.slice(0, 8)}`;
}
