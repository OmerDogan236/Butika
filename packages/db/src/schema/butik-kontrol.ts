import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { boutiques } from './boutiques';

// Haftalık butik değişim dedektörü: tur kaydı, bulgular, butik başına son durum.
export const butikKontrolTurlari = pgTable(
  'butik_kontrol_turlari',
  {
    id: uuid().primaryKey().defaultRandom(),
    baslangic: timestamp({ withTimezone: true }).defaultNow().notNull(),
    bitis: timestamp({ withTimezone: true }),
    durum: text().notNull().default('suruyor'),
    tetik: text().notNull(),
    kontrolEdilen: integer().notNull().default(0),
    sorunlu: integer().notNull().default(0),
    sayilar: jsonb().notNull().default({}),
    ozet: text(),
    epostaGonderildiAt: timestamp({ withTimezone: true }),
    // ISO yıl-hafta (Europe/Istanbul), ör. 2026-W40
    haftaAnahtari: text().notNull(),
  },
  (t) => [
    uniqueIndex('butik_kontrol_turlari_hafta_tetik_uniq')
      .on(t.haftaAnahtari, t.tetik)
      .where(sql`${t.tetik} = 'haftalik'`),
  ],
);

export const butikKontrolBulgulari = pgTable(
  'butik_kontrol_bulgulari',
  {
    id: uuid().primaryKey().defaultRandom(),
    turId: uuid()
      .notNull()
      .references(() => butikKontrolTurlari.id, { onDelete: 'cascade' }),
    boutiqueId: uuid()
      .notNull()
      .references(() => boutiques.id, { onDelete: 'cascade' }),
    tur: text().notNull(),
    onem: text().notNull(),
    yeni: boolean().notNull().default(true),
    kanit: text().notNull(),
    oncekiDeger: text(),
    simdikiDeger: text(),
    olusturma: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('butik_kontrol_bulgulari_tur_idx').on(t.turId),
    index('butik_kontrol_bulgulari_boutique_idx').on(t.boutiqueId),
  ],
);

export const butikSiteDurumu = pgTable('butik_site_durumu', {
  boutiqueId: uuid()
    .primaryKey()
    .references(() => boutiques.id, { onDelete: 'cascade' }),
  sonAlanAdi: text(),
  sonParaBirimi: text(),
  sonBaslik: text(),
  ardisikAcilmama: integer().notNull().default(0),
  sonKontrol: timestamp({ withTimezone: true }),
  yoksay: jsonb().notNull().default({}),
  // En son hangi turda işlendi (yarım kalan turun devamı için)
  turId: uuid(),
});

export type ButikKontrolTuru = typeof butikKontrolTurlari.$inferSelect;
export type ButikKontrolBulgusu = typeof butikKontrolBulgulari.$inferSelect;
export type ButikSiteDurumu = typeof butikSiteDurumu.$inferSelect;
