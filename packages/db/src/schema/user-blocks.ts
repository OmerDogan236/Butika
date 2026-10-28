import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

// Kullanıcı engelleme (App Store 1.2 gereği) — engelleyenin, engellenenin
// yorumlarını görmemesi için. Kompozit PK (aynı çift bir kez).
export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerUserId: uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    blockedUserId: uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerUserId, t.blockedUserId] }),
    index('user_blocks_blocker_idx').on(t.blockerUserId),
  ],
);

export type UserBlock = typeof userBlocks.$inferSelect;
export type NewUserBlock = typeof userBlocks.$inferInsert;
