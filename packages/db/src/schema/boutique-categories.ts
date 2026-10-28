import { index, integer, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { boutiques } from './boutiques';
import { categories } from './categories';

// Butik ↔ kategori çoka-çok ilişkisi. sortOrder kategori-içi sırayı tutar
// (bir butik her kategoride farklı sıraya konabilir). Global sıra için
// boutiques.sortOrder ayrı tutulur.
export const boutiqueCategories = pgTable(
  'boutique_categories',
  {
    boutiqueId: uuid()
      .references(() => boutiques.id, { onDelete: 'cascade' })
      .notNull(),
    categoryId: uuid()
      .references(() => categories.id, { onDelete: 'restrict' })
      .notNull(),
    sortOrder: integer().default(0).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.boutiqueId, t.categoryId] }),
    index('boutique_categories_category_sort_idx').on(t.categoryId, t.sortOrder),
  ],
);

export type BoutiqueCategory = typeof boutiqueCategories.$inferSelect;
export type NewBoutiqueCategory = typeof boutiqueCategories.$inferInsert;
