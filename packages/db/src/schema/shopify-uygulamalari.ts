import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Shopify Partner uygulaması kaydı — mağaza başına bir uygulama (özel dağıtım).
export const shopifyUygulamalari = pgTable('shopify_uygulamalari', {
  id: uuid().primaryKey().defaultRandom(),
  magaza: text().notNull().unique(), // 'xxx.myshopify.com'
  clientId: text().notNull(),
  secretSifreli: text().notNull(), // sifrele() çıktısı
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export type ShopifyUygulamasi = typeof shopifyUygulamalari.$inferSelect;
export type NewShopifyUygulamasi = typeof shopifyUygulamalari.$inferInsert;
