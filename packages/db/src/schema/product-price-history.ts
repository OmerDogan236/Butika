import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { trackedProducts } from './tracked-products';

export const productPriceHistory = pgTable(
  'product_price_history',
  {
    id: uuid().primaryKey().defaultRandom(),

    trackedProductId: uuid()
      .references(() => trackedProducts.id, { onDelete: 'cascade' })
      .notNull(),

    priceMinor: integer().notNull(),
    currency: text().notNull(),
    observedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('product_price_history_product_observed_idx').on(
      t.trackedProductId,
      t.observedAt.desc(),
    ),
  ],
);

export type ProductPriceHistory = typeof productPriceHistory.$inferSelect;
export type NewProductPriceHistory = typeof productPriceHistory.$inferInsert;
