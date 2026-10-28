import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const adminUsers = pgTable('admin_users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().unique().notNull(),
  passwordHash: text().notNull(),
  displayName: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type NewAdminUser = typeof adminUsers.$inferInsert;
