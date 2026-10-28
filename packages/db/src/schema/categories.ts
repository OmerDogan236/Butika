import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { countries } from './countries';

// Kategoriler pazar-scoped: her kayıt tek bir ülkeye ait. slug benzersizliği
// pazar-içi (TR'de 'elbise' ile US'te 'dresses' çakışmaz; aynı slug farklı
// pazarlarda olabilir). sortOrder de doğal olarak pazar-içi sıralamadır.
export const categories = pgTable(
  'categories',
  {
    id: uuid().primaryKey().defaultRandom(),
    countryCode: text()
      .references(() => countries.code)
      .notNull(),
    slug: text().notNull(),
    name: text().notNull(),
    sortOrder: integer().default(0).notNull(),
    isActive: boolean().default(true).notNull(),
    // Vitrin tarafı (1.2.4): 'kadin' | 'erkek'. Eski uygulamalar parametre göndermez → kadın.
    cinsiyet: text().default('kadin').notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('categories_country_slug_unique').on(t.countryCode, t.slug),
    index('categories_country_active_sort_idx').on(t.countryCode, t.isActive, t.sortOrder),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
