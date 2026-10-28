import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const events = pgTable(
  'events',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    type: text().notNull(),
    payload: jsonb().default({}).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('events_type_created_idx').on(t.type, t.createdAt.desc()),
    index('events_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('events_created_idx').on(t.createdAt.desc()),
  ],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
