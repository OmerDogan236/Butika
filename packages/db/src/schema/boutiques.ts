import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { countries } from './countries';

// Butikler pazar-scoped: her kayıt tek bir ülkeye ait. Aynı marka iki pazarda
// varsa iki ayrı kayıt olur (kapak/açıklama pazarına göre farklı olabilir).
export const boutiques = pgTable(
  'boutiques',
  {
    id: uuid().primaryKey().defaultRandom(),
    countryCode: text()
      .references(() => countries.code)
      .notNull(),
    name: text().notNull(),
    description: text().default('').notNull(),
    url: text().notNull(),
    coverImageUrl: text().notNull(),
    logoUrl: text(),
    isActive: boolean().default(true).notNull(),
    sortOrder: integer().default(0).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    // Fiyat segmenti — tarama verisinden hesaplanır (bkz. migration 0012).
    // Uygulamada RAKAM GÖSTERİLMEZ; temsiliFiyatTl yalnız sıralama/denetim için.
    fiyatSegmenti: text(), // 'uygun' | 'orta' | 'yuksek' | 'luks' | null
    temsiliFiyatTl: numeric({ precision: 12, scale: 2 }),
    anaKategori: text(),
    urunSayisiKategori: integer(),
    // 'tam' | 'yetersiz_veri' | 'kategori_belirsiz' | 'para_birimi_supheli'
    // | 'yan_urun_elendi' | 'fiyat_supheli' | 'elle_atandi'
    // 'elle_atandi' = admin panelinden elle seçildi; otomatik hesaplama DOKUNMAZ.
    fiyatGuven: text(),
    fiyatHesapTarihi: timestamp({ withTimezone: true }),
    // Tarz etiketi — ürünlerden dil modeliyle hesaplanır (butika_tarz.py), kapalı 9'lu sözlük:
    // minimal | sade şık | günlük | bohem | romantik | sokak | vintage | spor şık | cesur.
    // En fazla 2 etiket, baskın olan tarz1. Butikcan eşleştirmesinde ve önerilerinde kullanılır.
    tarz1: text(),
    tarz2: text(),
    // Hedef yaş aralıkları (YAS_ARALIKLARI değerleri) ve güveni; yalnız sıralamada kullanılır.
    hedefYaslar: text().array(),
    yasGuven: text(),
    tarzGuven: text(), // 'yuksek' | 'dusuk' | null
    // 'tam' | 'emin_degil' | 'kapsam_disi' | 'yetersiz_veri' | 'elle_atandi'
    // 'elle_atandi' = admin panelinden elle seçildi; otomatik hesaplama DOKUNMAZ.
    tarzDurumu: text(),
    tarzGerekce: text(),
    tarzHesapTarihi: timestamp({ withTimezone: true }),
    // Kategori grubuna özel etiketler (bkz. migration 0030).
    //
    // TARZDAN AYRI TUTULUR: tarz sözlüğü giyim içindir ve kullanıcının tarz testiyle
    // eşleştirilir; güzellik/parfüm gibi grupların etiketleri oraya karışırsa testte
    // kullanıcıya giyim tarzı gibi görünür ve eşleşmeyi bozar. Bu alan yalnız arama
    // ve Butikcan bağlamı içindir, tarz testine hiç girmez.
    //
    // Şu an yalnız Güzellik/Parfüm grubu dolu: doğal içerik | etkin bakım | niş parfüm
    // | günlük makyaj | lüks bakım. İleride iç giyim, eşarp gibi gruplar eklenecek.
    etiketler: text().array().default([]).notNull(),
    // Editörün Seçimi — vitrinin üstündeki elle seçilmiş şerit (admin panelinden).
    // editorSirasi küçükten büyüğe; boş olanlar sona, aralarında ada göre.
    // editorNotu kartta butik adının altında görünen tek cümle (en çok 140 karakter).
    editorSecimi: boolean().default(false).notNull(),
    editorSirasi: integer(),
    editorNotu: text(),
    // Fırsat sekmesi — admin'in indirimde diye işaretlediği butikler.
    // firsatSirasi küçükten büyüğe; boş olanlar sona, aralarında ada göre.
    // firsatNotu kartta butik adının altında görünen kısa indirim notu (en çok 140 karakter).
    firsat: boolean().default(false).notNull(),
    firsatNotu: text(),
    firsatSirasi: integer(),
    // Instagram hesap adı (küçük harf, @ olmadan). Instagram'dan "Paylaş… → Butika" ile
    // gelen profil linkini butikle eşleştirmek için. Boş = bilinmiyor.
    instagram: text(),
    // Kullanıcının Instagram/site paylaşımıyla eklediği butik ("Paylaş… → Butika"). Bu butikler
    // isActive=false başlar: yalnız ekleyenin Butiklerim'inde görünür, admin onaylayınca vitrine çıkar.
    // 'bekliyor' | 'onaylandi' | 'reddedildi' | null (admin'in eklediği butik)
    kullaniciDurumu: text(),
    ekleyenUserId: uuid(),
  },
  (t) => [
    index('boutiques_active_idx').on(t.isActive),
    index('boutiques_country_active_sort_idx').on(t.countryCode, t.isActive, t.sortOrder),
    index('boutiques_instagram_idx').on(t.instagram),
  ],
);

export type Boutique = typeof boutiques.$inferSelect;
export type NewBoutique = typeof boutiques.$inferInsert;
