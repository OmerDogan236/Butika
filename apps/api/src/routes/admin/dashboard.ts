import { events, boutiques, savedProducts, users } from '@butika/db';
import { IC_HESAP_EPOSTALARI } from '@butika/types';
import { and, count, desc, eq, gte, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { env } from '../../env';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';

export const adminDashboardRoutes = new Hono<AdminContext>();

// Pano sayıları mağaza yayınından (21 Eylül 2026, TR saati) başlar; öncesi test dönemi.
export const YAYIN_TARIHI = new Date('2026-09-21T00:00:00+03:00');

// Ekip ve mağaza inceleme hesapları panoda sayılmaz. Küçük harfle.
export const EKIP_EPOSTALARI = [
  ...new Set([...IC_HESAP_EPOSTALARI, env.REVIEW_AUTH_EMAIL.toLowerCase()]),
];

const ekipIdleri = () =>
  db
    .select({ id: users.id })
    .from(users)
    .where(inArray(sql`lower(${users.email})`, EKIP_EPOSTALARI));

adminDashboardRoutes.use('*', requireAdmin);

// Öne çıkan butikler penceresi — panodaki 24s / 7g / 30g seçimi. Bilinmeyen değer 30g.
const ARALIK_SAAT = { '24s': 24, '7g': 7 * 24, '30g': 30 * 24 } as const;
export type DashboardAralik = keyof typeof ARALIK_SAAT;

export function gecerliAralik(v: string | undefined): DashboardAralik {
  return v !== undefined && v in ARALIK_SAAT ? (v as DashboardAralik) : '30g';
}

adminDashboardRoutes.get('/', async (c) => {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const aralik = gecerliAralik(c.req.query('aralik'));
  const aralikBasi = new Date(now - ARALIK_SAAT[aralik] * 60 * 60 * 1000);

  const [totalsRows, dauRows, mauRows, topBoutiqueRows, topSavedRows, recentEventRows] =
    await Promise.all([
      // Totals — yayından beri, ekip hariç. Butik: yalnız vitrinde yayında olanlar.
      Promise.all([
        db
          .select({ n: count() })
          .from(users)
          .where(
            and(
              isNull(users.deletedAt),
              gte(users.createdAt, YAYIN_TARIHI),
              notInArray(sql`coalesce(lower(${users.email}), '')`, EKIP_EPOSTALARI),
            ),
          ),
        db.select({ n: count() }).from(boutiques).where(eq(boutiques.isActive, true)),
        db
          .select({ n: count() })
          .from(savedProducts)
          .where(
            and(
              gte(savedProducts.createdAt, YAYIN_TARIHI),
              notInArray(savedProducts.userId, ekipIdleri()),
            ),
          ),
        db
          .select({ n: count() })
          .from(events)
          .where(and(gte(events.createdAt, YAYIN_TARIHI), notInArray(events.userId, ekipIdleri()))),
      ]).then(([u, b, s, e]) => [
        { users: u[0]?.n, boutiques: b[0]?.n, savedProducts: s[0]?.n, events: e[0]?.n },
      ]),

      db
        .select({ n: sql<number>`count(distinct ${events.userId})` })
        .from(events)
        .where(and(gte(events.createdAt, dayAgo), notInArray(events.userId, ekipIdleri()))),

      db
        .select({ n: sql<number>`count(distinct ${events.userId})` })
        .from(events)
        .where(and(gte(events.createdAt, monthAgo), notInArray(events.userId, ekipIdleri()))),

      // Top butikler — seçili aralıkta butiği (boutique_view / webview_open) açan
      // FARKLI kişi sayısı. Olay sayılmaz: "Siteye git" iki olay birden yazıyor ve
      // aynı kişi butiği defalarca açabiliyor. Alan adı uyumluluk için viewCount.
      db
        .select({
          boutiqueId: sql<string>`${events.payload}->>'boutiqueId'`.as('boutique_id'),
          boutiqueName: boutiques.name,
          coverImageUrl: boutiques.coverImageUrl,
          viewCount: sql<number>`count(distinct ${events.userId})`.as('view_count'),
        })
        .from(events)
        .innerJoin(boutiques, sql`${events.payload}->>'boutiqueId' = ${boutiques.id}::text`)
        .where(
          and(
            gte(events.createdAt, aralikBasi),
            sql`${events.type} in ('boutique_view', 'webview_open')`,
            notInArray(events.userId, ekipIdleri()),
          ),
        )
        .groupBy(sql`${events.payload}->>'boutiqueId'`, boutiques.name, boutiques.coverImageUrl)
        .orderBy(desc(sql`count(distinct ${events.userId})`), boutiques.name)
        .limit(5),

      // Top kaydedilen ürünler — URL bazında frekans, yayından beri, ekip hariç
      db
        .select({
          url: savedProducts.url,
          title: savedProducts.title,
          imageUrl: savedProducts.imageUrl,
          boutiqueName: boutiques.name,
          saveCount: count().as('save_count'),
        })
        .from(savedProducts)
        .innerJoin(boutiques, eq(savedProducts.boutiqueId, boutiques.id))
        .where(
          and(
            gte(savedProducts.createdAt, YAYIN_TARIHI),
            notInArray(savedProducts.userId, ekipIdleri()),
          ),
        )
        .groupBy(savedProducts.url, savedProducts.title, savedProducts.imageUrl, boutiques.name)
        .orderBy(desc(count()))
        .limit(5),

      // Son 50 olay — kullanıcı adıyla join'li
      db
        .select({
          id: events.id,
          type: events.type,
          payload: events.payload,
          createdAt: events.createdAt,
          userId: events.userId,
          userDisplayName: users.displayName,
          userEmail: users.email,
        })
        .from(events)
        .leftJoin(users, eq(events.userId, users.id))
        .orderBy(desc(events.createdAt))
        .limit(50),
    ]);

  const totals = totalsRows[0] ?? { users: 0, boutiques: 0, savedProducts: 0, events: 0 };

  return c.json({
    totals: {
      users: Number(totals.users ?? 0),
      boutiques: Number(totals.boutiques ?? 0),
      savedProducts: Number(totals.savedProducts ?? 0),
      events: Number(totals.events ?? 0),
    },
    aralik,
    dau: Number(dauRows[0]?.n ?? 0),
    mau: Number(mauRows[0]?.n ?? 0),
    topBoutiques: topBoutiqueRows.map((r) => ({
      id: r.boutiqueId,
      name: r.boutiqueName,
      coverImageUrl: r.coverImageUrl,
      viewCount: Number(r.viewCount ?? 0),
    })),
    topSavedProducts: topSavedRows.map((r) => ({
      url: r.url,
      title: r.title,
      imageUrl: r.imageUrl,
      boutiqueName: r.boutiqueName,
      saveCount: Number(r.saveCount ?? 0),
    })),
    recentEvents: recentEventRows.map((r) => ({
      id: String(r.id),
      type: r.type,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
      user: r.userId
        ? {
            id: r.userId,
            displayName: r.userDisplayName ?? '—',
            email: r.userEmail ?? null,
          }
        : null,
    })),
  });
});
