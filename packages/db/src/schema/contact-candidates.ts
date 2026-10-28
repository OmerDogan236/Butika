import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { brandContacts } from './brand-contacts';

// Bir taramada bulunan HER e-posta adayi ayri satir. Sahip panelde hangi adresin
// nerede yazdigini gorup secebilsin diye kaynak URL'i saklaniyor.
// ONEMLI KURAL: buraya yalnizca sitede ACIKCA yazan adresler girer.
// Alan adindan "info@..." gibi adres URETILMEZ; bulunamazsa satir da olusmaz.
export const contactCandidates = pgTable(
  'contact_candidates',
  {
    id: uuid().primaryKey().defaultRandom(),
    brandContactId: uuid()
      .notNull()
      .references(() => brandContacts.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    // Adresin gorundugu sayfanin tam adresi — panelde yeni sekmede acilir
    sourceUrl: text().notNull(),
    // anasayfa | iletisim | hakkimizda | kurumsal | destek | diger
    sourcePageType: text().notNull(),
    // mailto | metin | gizlenmis  — mailto en guvenilir kaynak
    foundIn: text().notNull(),
    // genel | isbirligi | kurumsal | basin | destek | diger
    emailType: text().notNull(),
    // yuksek | orta | dusuk
    confidence: text().notNull(),
    // Guven neden dusuk/orta? Panelde sahibe aynen gosterilir, or.
    // "E-posta domaini butik web sitesi domaininden farklı."
    confidenceReason: text(),
    foundAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('contact_candidates_brand_email_unique').on(t.brandContactId, t.email),
    index('contact_candidates_brand_idx').on(t.brandContactId),
  ],
);

export type ContactCandidate = typeof contactCandidates.$inferSelect;
export type NewContactCandidate = typeof contactCandidates.$inferInsert;
