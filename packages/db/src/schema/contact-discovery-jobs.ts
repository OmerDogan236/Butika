import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { boutiques } from './boutiques';

// Tarama kuyrugu. push_outbox ile ayni desen: DB tabanli kuyruk + kiralama
// (lease), boylece birden fazla API kopyasi calissa bile ayni is iki kez
// yapilmaz. Ayri bir kuyruk servisi (Redis/BullMQ) gerekmiyor.
export const contactDiscoveryJobs = pgTable(
  'contact_discovery_jobs',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Hangi butik icin baslatildi (raporlama icin). Tarama sonucu alan adina yazilir.
    boutiqueId: uuid().references(() => boutiques.id, { onDelete: 'cascade' }),
    domain: text().notNull(),
    url: text().notNull(),
    // pending | running | done | failed | paused
    // paused: sahip taramayi duraklatti. Calisan istek bozulmaz, yalniz yeni is
    // alinmaz. Devam edince paused -> pending.
    status: text().default('pending').notNull(),
    attempts: integer().default(0).notNull(),
    lastError: text(),
    leaseToken: uuid(),
    lockedUntil: timestamp({ withTimezone: true }),
    // Uslu tekrar deneme: hata alan is hemen degil, bekleme suresi sonra alinir.
    nextAttemptAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp({ withTimezone: true }),
    // Bu taramada kac aday bulundu (0 = bulunamadi) — raporlama icin
    foundCount: integer(),
    // Pilot mu, toplu tarama mi — pilotu ayirt edebilmek icin
    batchLabel: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('contact_discovery_jobs_due_idx').on(t.status, t.nextAttemptAt)],
);

export type ContactDiscoveryJob = typeof contactDiscoveryJobs.$inferSelect;
export type NewContactDiscoveryJob = typeof contactDiscoveryJobs.$inferInsert;
