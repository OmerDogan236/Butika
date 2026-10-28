import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { boutiques } from './boutiques';
import { butikBaglantilari } from './butik-baglantilari';
import { gonderimler } from './gonderimler';
import { users } from './users';

export type SiparisSatiri = {
  ad: string;
  adet: number;
  birimFiyatMinor: number;
  disUrunId: string | null;
};

// Bağlı mağazadan taranan, Butika'dan gelen siparişler. komisyonMinor null = henüz yazılmadı.
export const butikSiparisleri = pgTable(
  'butik_siparisleri',
  {
    id: uuid().primaryKey().defaultRandom(),
    baglantiId: uuid()
      .notNull()
      .references(() => butikBaglantilari.id, { onDelete: 'cascade' }),
    boutiqueId: uuid()
      .notNull()
      .references(() => boutiques.id, { onDelete: 'cascade' }),
    disSiparisId: text().notNull(),
    siparisNo: text().notNull(),
    siparisAt: timestamp({ withTimezone: true }).notNull(),
    gonderimId: text().references(() => gonderimler.id, { onDelete: 'set null' }),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    durum: text().notNull(),
    odendi: boolean().notNull(),
    tutarMinor: integer().notNull(), // kargo ve vergi hariç
    currency: text().notNull(),
    satirlar: jsonb().$type<SiparisSatiri[]>(),
    kargoFirmasi: text(),
    takipNo: text(),
    takipUrl: text(),
    komisyonMinor: integer(),
    komisyonAt: timestamp({ withTimezone: true }),
    // Sipariş bir kez tamamen iptal görüldüyse komisyon bir daha yazılmaz.
    iptalGorulduAt: timestamp({ withTimezone: true }),
    // ikas'taki son güncelleme anı; daha eski anlık görüntü yok sayılır.
    disGuncellemeAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('butik_siparisleri_dis_uniq').on(t.baglantiId, t.disSiparisId),
    index('butik_siparisleri_user_idx').on(t.userId),
    index('butik_siparisleri_boutique_siparis_idx').on(t.boutiqueId, t.siparisAt),
  ],
);

export type ButikSiparisi = typeof butikSiparisleri.$inferSelect;
export type NewButikSiparisi = typeof butikSiparisleri.$inferInsert;
