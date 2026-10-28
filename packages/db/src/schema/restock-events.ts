import { integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { trackedProducts } from './tracked-products';

// A server-verified return to stock of one tracked product (a single size /
// colour). Users who asked to be told get a back_in_stock notification.
export const restockEvents = pgTable(
  'restock_events',
  {
    id: uuid().primaryKey().defaultRandom(),

    trackedProductId: uuid()
      .references(() => trackedProducts.id, { onDelete: 'cascade' })
      .notNull(),

    priceMinor: integer().notNull(),
    // Last verified in-stock price before the sell-out, in the same currency.
    previousPriceMinor: integer(),
    currency: text().notNull(),

    detectedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('restock_events_product_detected_unique').on(t.trackedProductId, t.detectedAt),
  ],
);

export type RestockEvent = typeof restockEvents.$inferSelect;
export type NewRestockEvent = typeof restockEvents.$inferInsert;
