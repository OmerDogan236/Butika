import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { boutiques } from './boutiques';
import { countries } from './countries';
import { users } from './users';

export const boutiqueSuggestions = pgTable(
  'boutique_suggestions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: text().notNull(),
    url: text().notNull(),
    note: text(),
    status: text().notNull().default('pending'),
    countryCode: text().references(() => countries.code), // öneri hangi pazara ait (null = eski kayıt)
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    approvedAt: timestamp({ withTimezone: true }),
    boutiqueId: uuid().references(() => boutiques.id, { onDelete: 'set null' }),
  },
  (t) => [index('boutique_suggestions_status_created_idx').on(t.status, t.createdAt.desc())],
);

export type BoutiqueSuggestion = typeof boutiqueSuggestions.$inferSelect;
export type NewBoutiqueSuggestion = typeof boutiqueSuggestions.$inferInsert;
