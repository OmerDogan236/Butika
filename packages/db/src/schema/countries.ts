import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Pazarlar. code = ISO 3166-1 alpha-2 (büyük harf: TR, US). defaultLanguage o
// pazarın varsayılan arayüz dili (kullanıcı tercihi yoksa). Bayrak emoji
// kod'dan türetilir (DB'de tutulmaz).
export const countries = pgTable('countries', {
  code: text().primaryKey(),
  name: text().notNull(),
  defaultLanguage: text().notNull(), // 'tr' | 'en' — zod ile valide
  isActive: boolean().default(true).notNull(),
  sortOrder: integer().default(0).notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export type Country = typeof countries.$inferSelect;
export type NewCountry = typeof countries.$inferInsert;
