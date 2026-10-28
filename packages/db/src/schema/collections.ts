import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const collections = pgTable(
  'collections',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: text().notNull(),
    description: text(),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('collections_user_name_unique').on(t.userId, t.name),
    index('collections_user_sort_idx').on(t.userId, t.sortOrder),
  ],
);

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
