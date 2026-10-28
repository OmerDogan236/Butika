import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

// Kullanıcı profili: tarz testi + davranıştan (kayıt, satın alma, butik açma) hesaplanır.
// Kişi başına tek satır; her hesapta üzerine yazılır. Kullanıcıya gösterilmez.
// Hesap kalıcı silinince cascade ile gider.
// Tasarım: docs/superpowers/specs/2026-10-05-kullanici-profili-tasarim.md (§1–2)

/** tarz/kategori/etiket → 0–1 puan (en yüksek 1). */
export type ProfilPuanlari = Record<string, number>;

export interface ProfilButcesi {
  /** fiyat segmenti → 0–1 puan */
  segmentler: ProfilPuanlari;
  /** para birimi → kaydedilen ürünlerin fiyat ortancası (kuruş/sent) */
  ortanca: Record<string, number>;
}

export interface ProfilUrunEtiketleri {
  tur: ProfilPuanlari;
  renk: ProfilPuanlari;
  malzeme: ProfilPuanlari;
}

export const PROFIL_KAYNAKLARI = ['test', 'davranis', 'karisik', 'bos'] as const;
export type ProfilKaynagi = (typeof PROFIL_KAYNAKLARI)[number];

export const kullaniciProfilleri = pgTable(
  'kullanici_profilleri',
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    tarz: jsonb().$type<ProfilPuanlari>().notNull(),
    butce: jsonb().$type<ProfilButcesi>().notNull(),
    kategoriler: jsonb().$type<ProfilPuanlari>().notNull(),
    urunEtiketleri: jsonb().$type<ProfilUrunEtiketleri>().notNull(),
    yasAraligi: text(),
    kayitSayisi: integer().notNull(),
    kaynak: text().$type<ProfilKaynagi>().notNull(),
    guncellendi: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index('kullanici_profilleri_kaynak_idx').on(t.kaynak)],
);

export type KullaniciProfiliSatiri = typeof kullaniciProfilleri.$inferSelect;
export type NewKullaniciProfiliSatiri = typeof kullaniciProfilleri.$inferInsert;
