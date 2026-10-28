import { bigserial, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Butikcan'a sorulan sorular. Kayıt ANONİMDİR — bilerek userId tutulmaz,
 * amaç kullanıcıyı değil, neyin sorulduğunu anlamaktır.
 */
export const butikcanQueries = pgTable(
  'butikcan_queries',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    query: text().notNull(),
    turnCount: integer().notNull(),
    market: text().notNull(),
    boutiqueCount: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('butikcan_queries_query_idx').on(t.query),
    index('butikcan_queries_created_idx').on(t.createdAt.desc()),
  ],
);

export type ButikcanQuery = typeof butikcanQueries.$inferSelect;
export type NewButikcanQuery = typeof butikcanQueries.$inferInsert;
