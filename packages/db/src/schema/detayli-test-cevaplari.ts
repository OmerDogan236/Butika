import { integer, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

// Detaylı test cevapları. Kişi başına tek satır; yeniden doldurulunca üzerine yazılır.
// cevaplar şeklini @butika/types detayliTestCevaplariSchema belirler (okurken doğrulanır).
// Hesap kalıcı silinince cascade ile gider.
// Tasarım: docs/superpowers/specs/2026-10-16-detayli-test-tasarim.md (§3)
export const detayliTestCevaplari = pgTable('detayli_test_cevaplari', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  testSurumu: integer().notNull(),
  cevaplar: jsonb().$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export type DetayliTestSatiri = typeof detayliTestCevaplari.$inferSelect;
