import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Admin "Bildirimler": elle planlanan duyuru bildirimleri (fiyat/stok bildirimi DEĞİL).
// durum: taslak (öneri; onay bekler) → planlandi (zamanı gelince işçi gönderir) →
// gonderiliyor → gonderildi. iptal: admin vazgeçti. gecikti: zamanından 60 dk'dan fazla
// sonra yakalandı (ör. sunucu kapalıydı), geç bildirim yerine hiç gönderilmedi.
// hata: gönderim sırasında beklenmeyen hata (sayaçlar boş kalabilir).
// kitle: all (bildirimi açık herkes) | savers (fiyatı takip edilen ürün kaydedenler).
// hedef: dokununca uygulamada ne açılsın (vitrin, firsat, butikcan, guncelleme, butik:<id>,
// kategori:<id>); null ise yalnız uygulama açılır. Bkz. @butika/types bildirimHedefiCoz.
// Sayaçlar gönderim sonunda yazılır; açılma PostHog'da push_opened.campaign ile izlenir.
export const bildirimPlanlari = pgTable(
  'bildirim_planlari',
  {
    id: uuid().primaryKey().defaultRandom(),
    baslik: text().notNull(),
    metin: text().notNull(),
    kitle: text().notNull().default('all'),
    hedef: text(),
    gonderimZamani: timestamp({ withTimezone: true }).notNull(),
    durum: text().notNull().default('taslak'),
    aliciSayisi: integer(),
    basarili: integer(),
    hatali: integer(),
    gonderildiAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('bildirim_planlari_durum_zaman_idx').on(t.durum, t.gonderimZamani)],
);

export type BildirimPlani = typeof bildirimPlanlari.$inferSelect;
