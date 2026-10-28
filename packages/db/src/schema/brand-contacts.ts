import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Marka iletisim defteri. Kasitli olarak butik kaydina DEGIL alan adina bagli:
// ayni marka iki pazarda iki ayri boutiques satiri olabiliyor, alan adi tekil
// oldugu icin ayni markaya iki kez tanitim maili gitmesi kendiliginden engellenir.
// Yeni butikler (ileride Discovery Agent) ayni deftere ayni sekilde girer.
export const brandContacts = pgTable(
  'brand_contacts',
  {
    id: uuid().primaryKey().defaultRandom(),
    // www/protokol temizlenmis alan adi, or. "sandmother.com" — dogal anahtar
    domain: text().notNull().unique(),
    // Tanitim mailinin gidecegi adres. Sahibin onayindan once de dolabilir
    // (sistem onerir), ama onay olmadan mail gonderilmez.
    email: text(),
    // bulunamadi | onay_bekliyor | onaylandi | gecersiz
    status: text().default('bulunamadi').notNull(),
    // Kalici: marka "listenizden cikin" derse true. Hicbir toplu islem bunu ezmez.
    doNotContact: boolean().default(false).notNull(),
    doNotContactReason: text(),
    lastDiscoveryAt: timestamp({ withTimezone: true }),
    // Son taramada acilan sayfa sayisi — hiz/maliyet denetimi icin
    lastDiscoveryPages: integer(),
    lastDiscoveryError: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('brand_contacts_status_idx').on(t.status)],
);

export type BrandContact = typeof brandContacts.$inferSelect;
export type NewBrandContact = typeof brandContacts.$inferInsert;
