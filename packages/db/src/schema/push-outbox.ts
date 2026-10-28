import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { notifications } from './notifications';
import { pushDevices } from './push-devices';

export const pushOutbox = pgTable('push_outbox', {
  id: uuid().primaryKey().defaultRandom(),
  notificationId: uuid().notNull().references(() => notifications.id, { onDelete: 'cascade' }),
  deviceId: uuid().notNull().references(() => pushDevices.id, { onDelete: 'cascade' }),
  token: text().notNull(),
  message: jsonb().$type<Record<string, unknown>>().notNull(),
  status: text().default('pending').notNull(),
  attempts: integer().default(0).notNull(),
  receiptAttempts: integer().default(0).notNull(),
  ticketId: text(),
  acceptedAt: timestamp({ withTimezone: true }),
  nextAttemptAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  leaseToken: uuid(),
  lockedUntil: timestamp({ withTimezone: true }),
  lastError: text(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, t => [
  unique('push_outbox_notification_device_unique').on(t.notificationId, t.deviceId),
  index('push_outbox_due_idx').on(t.status, t.nextAttemptAt),
]);
