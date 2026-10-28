import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { countries } from './countries';

// Pazar başına vitrin ayarları (admin: "Vitrin ayarları"). Satır yoksa her alan boş sayılır;
// pazar silinince ayarı da gider (ülke silme yalnız butik/kategori varken engellenir).
// seckiBasligi: Editörün Seçimi şeridinin başlığı; boşsa uygulama kendi metnini gösterir.
// guncelSurumIos/Android: mağazadaki son sürüm ("1.2.0"); uygulama bundan eskiyse
// Ayarlar'da "Yeni sürüm var" kartı çıkar.
export const vitrinAyarlari = pgTable('vitrin_ayarlari', {
  countryCode: text()
    .primaryKey()
    .references(() => countries.code, { onDelete: 'cascade' }),
  seckiBasligi: text(),
  guncelSurumIos: text(),
  guncelSurumAndroid: text(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export type VitrinAyari = typeof vitrinAyarlari.$inferSelect;
