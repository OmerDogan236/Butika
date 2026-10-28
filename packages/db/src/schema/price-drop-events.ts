import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { productPriceHistory } from './product-price-history';
import { trackedProducts } from './tracked-products';

export const priceDropEvents = pgTable(
  'price_drop_events',
  {
    id: uuid().primaryKey().defaultRandom(),

    trackedProductId: uuid()
      .references(() => trackedProducts.id, { onDelete: 'cascade' })
      .notNull(),

    priceHistoryId: uuid()
      .references(() => productPriceHistory.id, { onDelete: 'cascade' })
      .notNull(),

    previousPriceMinor: integer().notNull(),
    newPriceMinor: integer().notNull(),
    currency: text().notNull(),

    detectedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('price_drop_events_history_unique').on(t.priceHistoryId),

    index('price_drop_events_product_detected_idx').on(
      t.trackedProductId,
      t.detectedAt.desc(),
    ),
  ],
);

export type PriceDropEvent = typeof priceDropEvents.$inferSelect;
export type NewPriceDropEvent = typeof priceDropEvents.$inferInsert;