import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { priceDropEvents } from './price-drop-events';
import { restockEvents } from './restock-events';
import { users } from './users';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid().primaryKey().defaultRandom(),

    userId: uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // 'price_drop' points at priceDropEventId, 'back_in_stock' at restockEventId.
    type: text().default('price_drop').notNull(),

    priceDropEventId: uuid()
      .references(() => priceDropEvents.id, { onDelete: 'cascade' }),

    restockEventId: uuid()
      .references(() => restockEvents.id, { onDelete: 'cascade' }),

    readAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('notifications_user_price_drop_unique').on(
      t.userId,
      t.priceDropEventId,
    ),

    unique('notifications_user_restock_unique').on(
      t.userId,
      t.restockEventId,
    ),

    check('notifications_event_kind', sql`(type = 'price_drop' and price_drop_event_id is not null and restock_event_id is null)
      or (type = 'back_in_stock' and restock_event_id is not null and price_drop_event_id is null)`),

    index('notifications_user_created_idx').on(
      t.userId,
      t.createdAt.desc(),
    ),

    index('notifications_user_read_idx').on(
      t.userId,
      t.readAt,
    ),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
