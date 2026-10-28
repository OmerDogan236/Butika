import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { countries } from './countries';

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    appleSub: text().unique(),
    googleSub: text().unique(),
    email: text(),
    displayName: text().notNull(),
    avatarUrl: text(),
    gender: text(), // 'female' | 'male' | null — zod ile valide
    heightCm: integer(), // null = belirtilmemiş
    weightKg: integer(), // null = belirtilmemiş
    showStatsInComments: boolean().default(false).notNull(), // yorumlarda göster (gizlilik) — yeni hesaplarda kapalı
    language: text(), // 'tr' | 'en' | null — null = oto (cihaz dili / pazar varsayılanı)
    countryCode: text().references(() => countries.code, { onDelete: 'set null' }), // pazar tercihi, null = oto (CF-IPCountry)
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp({ withTimezone: true }),
    // Sign in with Apple refresh token — yalnız hesap silinince Apple yetkisini iptal (revoke)
    // etmek için tutulur; istemciye asla dönmez.
    appleRefreshToken: text(),
  },
  (t) => [
    index('users_apple_sub_idx').on(t.appleSub),
    index('users_google_sub_idx').on(t.googleSub),
    index('users_last_seen_idx').on(t.lastSeenAt.desc()),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
