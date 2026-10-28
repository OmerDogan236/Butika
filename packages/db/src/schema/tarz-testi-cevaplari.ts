import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// Tarz testi cevapları. Her çözüm yeni satırdır (üzerine yazılmaz); profil en sonuncuyu
// kullanır, admin raporu geçmişi analiz eder. Hesap kalıcı silinince cascade ile gider.
export const tarzTestiCevaplari = pgTable(
  'tarz_testi_cevaplari',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    testSurumu: integer().notNull(),
    senaryoCevaplari: jsonb().$type<Record<string, string[]>>().notNull(),
    acikTarzlar: text().array().notNull(),
    fiyatSegmentleri: text().array().notNull(),
    renkler: text().array().notNull(),
    tarz1: text(),
    tarz2: text(),
    senaryoTarz1: text(),
    senaryoTarz2: text(),
    // Test anında favorilerden çıkan tarz (rapordaki "test ↔ favori örtüşmesi" için).
    favoriTarz1: text(),
    favoriTarz2: text(),
    yasAraligi: text(), // '18_24' | '25_34' | '35_44' | '45_54' | '55_plus' | null
    esnek: boolean().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('tarz_testi_cevaplari_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('tarz_testi_cevaplari_created_idx').on(t.createdAt.desc()),
  ],
);

export type TarzTestiCevabi = typeof tarzTestiCevaplari.$inferSelect;
export type NewTarzTestiCevabi = typeof tarzTestiCevaplari.$inferInsert;
