import type { Oran } from './tarz-testi';

// Admin "Kullanıcı Profilleri" raporu. İsimsiz: kullanıcı kısa kimlikle (id'nin ilk 8
// karakteri) görünür; isim/e-posta yalnız sunucuda PROFIL_RAPOR_KIMLIK_GOSTER açıkken gelir.
// Tasarım: docs/superpowers/specs/2026-10-05-kullanici-profili-tasarim.md (§5)

export const PROFIL_RAPOR_ARALIKLARI = ['7d', '30d', '90d'] as const;
export type ProfilRaporAraligi = (typeof PROFIL_RAPOR_ARALIKLARI)[number];

export interface ProfilUyumu {
  /** Karşılaştırılabilen kişi (test + en az 3 kayıt, bütçede ayrıca segment verisi). */
  kisi: number;
  uyusan: number;
  /** Yüzde; küçük grupta null. */
  oran: number | null;
}

export interface ProfilListeSatiri {
  kisaKimlik: string;
  /** Yalnız PROFIL_RAPOR_KIMLIK_GOSTER açıkken. */
  ad?: string | null;
  eposta?: string | null;
  kaynak: string;
  tarzlar: string[];
  butce: string[];
  /** para birimi → fiyat ortancası (kuruş/sent) */
  ortanca: Record<string, number>;
  ilgiAlanlari: string[];
  kayitSayisi: number;
  guncellendi: string;
}

export interface VitrinAcmaSatiri {
  siralama: 'kisisel' | 'onerilen';
  /** Vitrinden bu sıralamayla en az bir butik açan kişi. */
  kisi: number;
  acma: number;
  /** Kişi başına açma, tek ondalık; küçük grupta null. */
  kisiBasina: number | null;
}

export interface ProfilRaporu {
  range: ProfilRaporAraligi;
  anahtarlar: { hesap: boolean; vitrin: boolean; kimlikGoster: boolean };
  ozet: {
    profil: number;
    /** bos dışındaki profiller; dağılımlar bunun üzerinden. */
    dolu: number;
    kaynak: Oran[];
    tarz: Oran[];
    butce: Oran[];
    yas: Oran[];
    kategoriler: Oran[];
  };
  fark: { tarz: ProfilUyumu; butce: ProfilUyumu };
  kullanicilar: { toplam: number; satirlar: ProfilListeSatiri[] };
  oneri: {
    gosterim: number;
    tiklama: number;
    tiklamaOrani: number | null;
    vitrin: VitrinAcmaSatiri[];
  };
}

/**
 * GET /me/profil-durumu. dolu: sunucu bu kullanıcıyı profile göre sıralıyor (anahtar açık ve
 * profil boş değil). Mobil, tarz testi olmasa da "Sana özel" seçeneğini buna göre gösterir.
 */
export interface ProfilDurumu {
  dolu: boolean;
}
