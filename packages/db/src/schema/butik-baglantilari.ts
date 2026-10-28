import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { boutiques } from './boutiques';

// Butik davet bağlantısı — admin üretir, butik sahibi tek kullanımlık linkle mağazasını bağlar.
export const baglantiDavetleri = pgTable('baglanti_davetleri', {
  id: uuid().primaryKey().defaultRandom(),
  token: text().notNull().unique(), // 32 bayt base64url
  boutiqueId: uuid()
    .notNull()
    .references(() => boutiques.id, { onDelete: 'cascade' }),
  olusturan: text(),
  platform: text().notNull().default('ikas'), // 'ikas' | 'shopify'
  kullanildiAt: timestamp({ withTimezone: true }),
  iptalAt: timestamp({ withTimezone: true }),
  // ikas mağaza adı (xxx.myikas.com'daki xxx); admin önceden yazabilir.
  magazaAdi: text(),
  magazaAdiKaynak: text(), // 'admin' (butik değiştiremez) | 'butik' (sonraki onayda düzeltilebilir)
  // OAuth `state`: her "bağla" isteğinde yenilenir, 30 dk geçerli.
  durumAnahtari: text().unique(),
  durumAt: timestamp({ withTimezone: true }),
  // Butiğin şart onayı; bağlantı kurulunca bağlantı satırına taşınır.
  onaylayanAd: text(),
  iletisimEposta: text(),
  sartlarSurumu: text(),
  onayAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

// Butiğin dış mağaza bağlantısı (ilk platform: ikas). Butik başına tek bağlantı.
export const butikBaglantilari = pgTable(
  'butik_baglantilari',
  {
    id: uuid().primaryKey().defaultRandom(),
    boutiqueId: uuid()
      .notNull()
      .unique()
      .references(() => boutiques.id, { onDelete: 'cascade' }),
    platform: text().notNull(), // 'ikas'
    magazaAdi: text().notNull(),
    kimlikSifreli: text().notNull(), // şifreli IkasTokenlari JSON'u; kapanınca ''
    ikasYetkiliUygulamaId: text().unique(), // ikas authorizedAppId
    ikasMerchantId: text(),
    baglandiAt: timestamp({ withTimezone: true }), // son (yeniden) bağlanma; eski bildirimler yok sayılır
    durum: text().notNull(), // 'aktif' | 'koptu' | 'kapali'
    tahsilat: text().notNull().default('deneme'), // 'deneme' | 'ikas' | 'shopify' | 'havale'
    iletisimEposta: text().notNull(),
    onaylayanAd: text().notNull(),
    sartlarSurumu: text().notNull(),
    onayAt: timestamp({ withTimezone: true }).notNull(),
    sonUrunEsitlemeAt: timestamp({ withTimezone: true }),
    sonSiparisTaramaAt: timestamp({ withTimezone: true }),
    sonOzetAyi: text(), // '2026-10'
    iadePolitikasi: text(),
    sonHata: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('butik_baglantilari_durum_idx').on(t.durum),
    // Shopify'da bir mağaza tek butiğe bağlanır (ikas'ta tekillik ikasYetkiliUygulamaId'de).
    uniqueIndex('butik_baglantilari_platform_magaza_uq')
      .on(t.platform, t.magazaAdi)
      .where(sql`${t.platform} = 'shopify'`),
  ],
);

export type BaglantiDaveti = typeof baglantiDavetleri.$inferSelect;
export type NewBaglantiDaveti = typeof baglantiDavetleri.$inferInsert;
export type ButikBaglantisi = typeof butikBaglantilari.$inferSelect;
export type NewButikBaglantisi = typeof butikBaglantilari.$inferInsert;
