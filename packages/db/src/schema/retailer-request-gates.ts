import { pgTable,text,timestamp } from 'drizzle-orm/pg-core';
export const retailerRequestGates = pgTable('retailer_request_gates', {
  origin:text().primaryKey(),
  nextRequestAt:timestamp({withTimezone:true}).notNull(),
  blockedUntil:timestamp({withTimezone:true}),
  updatedAt:timestamp({withTimezone:true}).defaultNow().notNull(),
});
