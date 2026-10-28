import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { boutiques } from './boutiques';
import { users } from './users';

// Kullanıcının kaydettiği butikler ("Butiklerim"). Ürün kaydından ayrı: butik sayfasındaki
// kalp ya da Instagram'dan "Paylaş… → Butika" ile eklenir.
// kaynak: 'uygulama' | 'instagram' | 'site' (paylaşılan butik sitesi linki)
export const kayitliButikler = pgTable(
  'kayitli_butikler',
  {
    userId: uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    boutiqueId: uuid()
      .references(() => boutiques.id, { onDelete: 'cascade' })
      .notNull(),
    kaynak: text().notNull().default('uygulama'),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.boutiqueId] }),
    index('kayitli_butikler_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
);

export type KayitliButik = typeof kayitliButikler.$inferSelect;
