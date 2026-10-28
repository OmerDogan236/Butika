import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { brandContacts } from './brand-contacts';

// Gonderilen her tanitim maili icin bir satir.
//
// CIFT GONDERIM KORUMASI: (domain, campaign) ciftinde BENZERSIZ indeks var ve
// yalniz gercek gonderimleri kapsiyor (is_test = false). Ayni butona iki kez
// basilsa, ag tekrar denese ya da iki istek ayni anda gelse bile veritabani
// ikinci kaydi reddeder — koddaki kontrolden bagimsiz, son savunma hatti.
//
// TEST GONDERIMLERI: is_test = true. Gercek butikle iliskilendirilmez
// (brand_contact_id ve domain bos kalir), butigin durumunu degistirmez ve
// benzersiz indekse takilmaz.
export const outreachEmails = pgTable(
  'outreach_emails',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Test gonderimlerinde null
    brandContactId: uuid().references(() => brandContacts.id, { onDelete: 'set null' }),
    domain: text(),
    recipientEmail: text().notNull(),
    // Hangi tanitim kampanyasi, or. 'tanitim-v1'
    campaign: text().notNull(),
    subject: text().notNull(),
    isTest: boolean().default(false).notNull(),
    // Brevo'nun dondurdugu messageId — webhook olaylari bununla eslesir
    brevoMessageId: text(),
    // hazirlaniyor | gonderildi | ulasti | acildi | tiklandi | geri_dondu |
    // engellendi | listeden_cikti | basarisiz
    status: text().default('hazirlaniyor').notNull(),
    errorMessage: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    openedAt: timestamp({ withTimezone: true }),
    clickedAt: timestamp({ withTimezone: true }),
    bouncedAt: timestamp({ withTimezone: true }),
    blockedAt: timestamp({ withTimezone: true }),
    unsubscribedAt: timestamp({ withTimezone: true }),
    lastEventAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('outreach_emails_domain_campaign_unique')
      .on(t.domain, t.campaign)
      .where(sql`is_test = false`),
    index('outreach_emails_message_idx').on(t.brevoMessageId),
    index('outreach_emails_status_idx').on(t.status, t.createdAt),
  ],
);

export type OutreachEmail = typeof outreachEmails.$inferSelect;
export type NewOutreachEmail = typeof outreachEmails.$inferInsert;

// Brevo webhook olaylari. Ayni olay iki kez gelirse benzersiz indeks sayesinde
// ikinci kayit yok sayilir (idempotent).
export const outreachEmailEvents = pgTable(
  'outreach_email_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    outreachEmailId: uuid()
      .notNull()
      .references(() => outreachEmails.id, { onDelete: 'cascade' }),
    event: text().notNull(),
    eventAt: timestamp({ withTimezone: true }).notNull(),
    payload: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('outreach_email_events_unique').on(t.outreachEmailId, t.event, t.eventAt)],
);

export type OutreachEmailEvent = typeof outreachEmailEvents.$inferSelect;
