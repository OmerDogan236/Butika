import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { boutiques } from './boutiques';

export const trackedProducts = pgTable(
  'tracked_products',
  {
    id: uuid().primaryKey().defaultRandom(),

    boutiqueId: uuid()
      .references(() => boutiques.id, { onDelete: 'restrict' })
      .notNull(),

    canonicalUrl: text().notNull(),
    sourceUrl: text().notNull(),
    domain: text().notNull(),
    sourceProductId: text(),
    title: text(),

    currentPriceMinor: integer(),
    availability: text().default('unknown').notNull(),
    notificationBaselinePriceMinor: integer(),
    notificationBaselineCurrency: text(),
    notificationBaselineAt: timestamp({ withTimezone: true }),
    currency: text(),

    trackingStatus: text().default('active').notNull(),
    lastCheckedAt: timestamp({ withTimezone: true }),
    nextCheckAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    checkLeaseUntil: timestamp({ withTimezone: true }),
    checkLeaseToken: uuid(),
    lastSuccessAt: timestamp({ withTimezone: true }),
    lastError: text(),
    consecutiveFailures: integer().default(0).notNull(),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('tracked_products_canonical_url_unique').on(t.canonicalUrl),
    index('tracked_products_boutique_idx').on(t.boutiqueId),
    index('tracked_products_status_checked_idx').on(t.trackingStatus, t.lastCheckedAt),
    index('tracked_products_due_idx').on(t.trackingStatus, t.nextCheckAt),
    index('tracked_products_domain_product_idx').on(t.domain, t.sourceProductId),
  ],
);

export type TrackedProduct = typeof trackedProducts.$inferSelect;
export type NewTrackedProduct = typeof trackedProducts.$inferInsert;
