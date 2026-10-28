import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const pushDevices = pgTable(
  'push_devices',
  {
    id: uuid().primaryKey().defaultRandom(),

    userId: uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    installationId: text().notNull(),

    expoPushToken: text().notNull(),

    platform: text().notNull(),

    enabled: boolean().default(true).notNull(),

    lastSeenAt: timestamp({ withTimezone: true })
      .defaultNow()
      .notNull(),

    createdAt: timestamp({ withTimezone: true })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique('push_devices_installation_unique').on(t.installationId),

    unique('push_devices_expo_token_unique').on(t.expoPushToken),

    index('push_devices_user_enabled_idx').on(
      t.userId,
      t.enabled,
    ),

    index('push_devices_last_seen_idx').on(
      t.lastSeenAt.desc(),
    ),
  ],
);

export type PushDevice = typeof pushDevices.$inferSelect;
export type NewPushDevice = typeof pushDevices.$inferInsert;