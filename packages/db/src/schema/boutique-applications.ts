import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Landing page'deki "Butiğini Ücretsiz Ekle" formundan gelen butik başvuruları.
// Ziyaretçi formu — giriş gerektirmez, kullanıcıya bağlı değil (boutique_suggestions'tan farkı).
export const boutiqueApplications = pgTable(
  'boutique_applications',
  {
    id: uuid().primaryKey().defaultRandom(),
    boutiqueName: text().notNull(), // Butik Adı
    city: text().notNull(), // Şehir
    contactName: text().notNull(), // İsim Soyisim
    phone: text().notNull(), // Telefon
    email: text().notNull(), // E-posta (aynı e-posta tekrar başvurabilir — unique değil)
    website: text(), // Website veya Instagram (opsiyonel)
    description: text(), // Butik hakkında (opsiyonel)
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('boutique_applications_created_idx').on(t.createdAt.desc())],
);

export type BoutiqueApplication = typeof boutiqueApplications.$inferSelect;
export type NewBoutiqueApplication = typeof boutiqueApplications.$inferInsert;
