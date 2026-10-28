import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { boutiques } from './boutiques';
import { users } from './users';

export const comments = pgTable(
  'comments',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    boutiqueId: uuid()
      .references(() => boutiques.id, { onDelete: 'restrict' })
      .notNull(),
    url: text().notNull(),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('comments_url_created_idx').on(t.url, t.createdAt.desc()),
    index('comments_boutique_created_idx').on(t.boutiqueId, t.createdAt.desc()),
    index('comments_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
);

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
