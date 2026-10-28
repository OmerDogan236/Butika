import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { boutiques } from './boutiques';
import { users } from './users';
import { trackedProducts } from './tracked-products';

export const savedProducts = pgTable(
  'saved_products',
  {
    id: uuid().primaryKey().defaultRandom(),  
    userId: uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    boutiqueId: uuid()
      .references(() => boutiques.id, { onDelete: 'restrict' })
      .notNull(),
    url: text().notNull(),
    title: text().notNull(),
    imageUrl: text(),
    description: text(),
    trackedProductId: uuid().references(() => trackedProducts.id, { onDelete: 'set null' }),
    trackingStartedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    // "Stok gelince haber ver" for this exact size/colour: armed at (null = off).
    // Confirmed once the server itself has seen it sold out; only a confirmed
    // alert fires, once.
    restockAlertAt: timestamp({ withTimezone: true }),
    restockConfirmedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    // Satın alım takibi — purchasedAt null = satın alınmadı; deliveredAt null = yolda.
    purchasedAt: timestamp({ withTimezone: true }),
    orderNumber: text(),
    carrier: text(),
    trackingNumber: text(),
    deliveredAt: timestamp({ withTimezone: true }),
    // Veri kalitesi (profil aşama 0). null = henüz sınıflandırılmadı.
    sayfaTuru: text(),
    // Ürün etiketleri (sözlük: @butika/types urun-etiketi). null = etiketlenmedi.
    urunTuru: text(),
    urunRengi: text(),
    urunMalzemesi: text(),
    etiketlendiAt: timestamp({ withTimezone: true }),
    etiketDeneme: integer().default(0).notNull(),
    etiketDenemeAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    unique('saved_products_user_url_unique').on(t.userId, t.url),
    index('saved_products_user_boutique_idx').on(t.userId, t.boutiqueId),
    index('saved_products_tracked_product_idx').on(t.trackedProductId),
    index('saved_products_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('saved_products_user_purchased_idx').on(t.userId, t.purchasedAt.desc()),
    index('saved_products_etiket_bekleyen_idx').on(t.etiketlendiAt, t.etiketDeneme),
  ],
);

export type SavedProduct = typeof savedProducts.$inferSelect;
export type NewSavedProduct = typeof savedProducts.$inferInsert;
