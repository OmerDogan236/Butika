import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { boutiques } from './boutiques';
import { users } from './users';

// Kullanıcının butiğe yönlendirilme kaydı (komisyon atfı için). id = 12 karakter base32.
export const gonderimler = pgTable(
  'gonderimler',
  {
    id: text().primaryKey(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    boutiqueId: uuid()
      .notNull()
      .references(() => boutiques.id, { onDelete: 'cascade' }),
    url: text().notNull(),
    kaynak: text().notNull().default('app'),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('gonderimler_boutique_created_idx').on(t.boutiqueId, t.createdAt)],
);

export type Gonderim = typeof gonderimler.$inferSelect;
export type NewGonderim = typeof gonderimler.$inferInsert;
