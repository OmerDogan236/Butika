import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { collections } from './collections';
import { savedProducts } from './saved-products';

export const savedProductCollections = pgTable(
  'saved_product_collections',
  {
    savedProductId: uuid()
      .references(() => savedProducts.id, { onDelete: 'cascade' })
      .notNull(),
    collectionId: uuid()
      .references(() => collections.id, { onDelete: 'cascade' })
      .notNull(),
    addedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.savedProductId, t.collectionId] }),
    index('saved_product_collections_collection_added_idx').on(t.collectionId, t.addedAt.desc()),
  ],
);

export type SavedProductCollection = typeof savedProductCollections.$inferSelect;
export type NewSavedProductCollection = typeof savedProductCollections.$inferInsert;
