import { bigserial, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const searchQueries = pgTable(
  'search_queries',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    query: text().notNull(),
    resultCount: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('search_queries_query_idx').on(t.query),
    index('search_queries_created_idx').on(t.createdAt.desc()),
  ],
);

export type SearchQuery = typeof searchQueries.$inferSelect;
export type NewSearchQuery = typeof searchQueries.$inferInsert;
