import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { boutiques } from './boutiques';
import { butikBaglantilari } from './butik-baglantilari';

// Bağlı mağazadan eşitlenen ürün/varyant satırları. disVaryantId null = ürün düzeyi.
export const baglantiUrunleri = pgTable(
  'baglanti_urunleri',
  {
    id: uuid().primaryKey().defaultRandom(),
    baglantiId: uuid()
      .notNull()
      .references(() => butikBaglantilari.id, { onDelete: 'cascade' }),
    boutiqueId: uuid()
      .notNull()
      .references(() => boutiques.id, { onDelete: 'cascade' }),
    disUrunId: text(),
    disVaryantId: text(),
    ad: text(),
    aciklama: text(),
    url: text().notNull(),
    gorseller: jsonb().$type<string[]>(),
    fiyatMinor: integer(),
    indirimliFiyatMinor: integer(),
    currency: text(),
    stokta: boolean(),
    stokAdedi: integer(),
    secenekler: jsonb().$type<Record<string, string>>(), // beden/renk
    kategori: text(),
    aktif: boolean().notNull().default(true),
    sonGorulmeAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    unique('baglanti_urunleri_dis_uniq')
      .on(t.baglantiId, t.disUrunId, t.disVaryantId)
      .nullsNotDistinct(),
    index('baglanti_urunleri_url_idx').on(t.url),
  ],
);

export type BaglantiUrunu = typeof baglantiUrunleri.$inferSelect;
export type NewBaglantiUrunu = typeof baglantiUrunleri.$inferInsert;
