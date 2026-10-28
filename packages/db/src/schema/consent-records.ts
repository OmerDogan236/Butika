import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// KVKK rıza defteri — YASAL İSPAT kaydı. EKLE-ONLY: satırlar asla güncellenmez/silinmez.
// Her satır = bir kişinin, bir onay türü için, tek bir kararı (verildi/reddedildi).
// Onay geri çekilirse yeni bir "granted=false" satırı eklenir (mevcut satır değişmez).
// userId'ye FK YOK — kullanıcı silinse bile rıza kaydı ispat için durmalı.
export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Kime ait — en az biri dolu olur:
    email: text(), // e-posta (web formu / mobil kayıt)
    userId: uuid(), // kullanıcı ID (giriş yapmışsa) — FK yok (kalıcı ispat)
    visitorId: text(), // anonim ziyaretçi ID (çerez bandı — e-posta yokken)
    // Ne için:
    consentType: text().notNull(), // 'kvkk_acik_riza' | 'ticari_ileti' | 'cerez_analitik' | 'yapay_zeka_aktarim'
    granted: boolean().notNull(), // verildi mi (true) / reddedildi mi (false)
    // İspat detayları:
    textVersion: text().notNull(), // onay metninin versiyonu (örn 'v1')
    source: text().notNull(), // 'web_butik_formu' | 'web_quiz' | 'web_cerez' | 'mobil_kayit' ...
    ipAddress: text(), // sunucu tarafında header'dan alınır
    userAgent: text(), // cihaz/tarayıcı bilgisi
    locale: text(), // 'tr' | 'en'
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('consent_records_email_idx').on(t.email),
    index('consent_records_user_idx').on(t.userId),
    index('consent_records_created_idx').on(t.createdAt.desc()),
  ],
);

export type ConsentRecord = typeof consentRecords.$inferSelect;
export type NewConsentRecord = typeof consentRecords.$inferInsert;
