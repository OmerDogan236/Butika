import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Butikcan öneri sonuçları cache'i. Anahtar: 'chip:<id>' veya 'q:<normalize(query)>'.
// expiresAt geçmişse kayıt bayat sayılır (çip uzun, serbest metin kısa TTL).
export const butikcanCache = pgTable('butikcan_cache', {
  key: text().primaryKey(),
  result: jsonb().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export type ButikcanCacheRow = typeof butikcanCache.$inferSelect;
