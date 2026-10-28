import {
  events,
  boutiques,
  collections,
  comments,
  priceDropEvents,
  pushDevices,
  savedProducts,
  users,
} from '@butika/db';
import { profileUpdateSchema } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { and, count, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { revokeAppleRefreshToken } from '../lib/apple-token';
import { type AuthContext, requireAuth, serializeUser } from '../lib/auth';
import { db } from '../lib/db';
import { ApiError } from '../lib/errors';
import { icerikUygunMu } from '../lib/icerik-filtresi';
import { isActiveMarket } from '../lib/market';
import { kazanciTopla, rozetleriHesapla, tarziCikar } from '../lib/profil-ozet';
import { meDetayliTestRoutes } from './me-detayli-test';
import { meTarzRoutes, sonTarzTesti } from './me-tarz';

export const meRoutes = new Hono<AuthContext>();

meRoutes.use('*', requireAuth);

meRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.deletedAt) throw ApiError.notFound('user not found');

  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));

  return c.json(serializeUser(user));
});

meRoutes.patch('/', zValidator('json', profileUpdateSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.req.valid('json');
  // Pazar tercihi verildiyse aktif bir pazar olmalı (null = oto'ya dönüş, serbest).
  if (body.countryCode && !(await isActiveMarket(body.countryCode))) {
    throw ApiError.badRequest('invalid_country', 'geçersiz veya pasif pazar');
  }
  // Görünen ad yorumların yanında herkese görünüyor → o da kullanıcı üretimi
  // içerik sayılır ve aynı filtreden geçer (App Store Guideline 1.2).
  if (body.displayName && !icerikUygunMu(body.displayName).uygun) {
    throw ApiError.badRequest('inappropriate_content', 'görünen ad uygunsuz ifade içeriyor');
  }
  // Boş body → no-op: mevcut kullanıcıyı döndür (Drizzle .set({}) hata verir).
  if (Object.keys(body).length === 0) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.deletedAt) throw ApiError.notFound('user not found');
    return c.json(serializeUser(user));
  }
  const [updated] = await db.update(users).set(body).where(eq(users.id, userId)).returning();
  if (!updated || updated.deletedAt) throw ApiError.notFound('user not found');
  return c.json(serializeUser(updated));
});

// KVKK: soft delete now, cron hard-deletes after 30 days. Push cihazları hemen
// kapatılır: silinen hesabın telefonuna 30 gün boyunca bildirim gitmemeli.
meRoutes.delete('/', async (c) => {
  const userId = c.get('userId');
  // Apple ile girildiyse Apple yetkisini iptal et (Apple hesap silme şartı). Başarısız olsa da
  // silme sürer; token her durumda silinir.
  const [appleToken] = await db
    .select({ token: users.appleRefreshToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (appleToken?.token) await revokeAppleRefreshToken(appleToken.token);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ deletedAt: new Date(), appleRefreshToken: null })
      .where(eq(users.id, userId));
    await tx
      .update(pushDevices)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(pushDevices.userId, userId));
  });
  return c.json({ ok: true });
});

// GET /me/profil-ozet — profil sayfasının takip/sipariş/tarz/rozet/son gezilen özeti.
// Bildirimler ayrı uçtan (/notifications) okunur; burada tekrarlanmaz.
meRoutes.get('/profil-ozet', async (c) => {
  const userId = c.get('userId');
  const otuzGun = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [sayimlar, dususler, butikTarzlari, koleksiyonSayisi, yorumSayisi, gezilenler] =
    await Promise.all([
      db
        .select({
          kayitli: count(),
          takipte: sql<number>`count(*) filter (where ${savedProducts.trackedProductId} is not null)`,
          yolda: sql<number>`count(*) filter (where ${savedProducts.purchasedAt} is not null and ${savedProducts.deliveredAt} is null)`,
          teslim: sql<number>`count(*) filter (where ${savedProducts.deliveredAt} is not null)`,
        })
        .from(savedProducts)
        .where(eq(savedProducts.userId, userId)),
      db
        .select({
          savedProductId: savedProducts.id,
          baslik: savedProducts.title,
          previousPriceMinor: priceDropEvents.previousPriceMinor,
          newPriceMinor: priceDropEvents.newPriceMinor,
          currency: priceDropEvents.currency,
        })
        .from(priceDropEvents)
        .innerJoin(
          savedProducts,
          eq(savedProducts.trackedProductId, priceDropEvents.trackedProductId),
        )
        .where(and(eq(savedProducts.userId, userId), gte(priceDropEvents.detectedAt, otuzGun)))
        .orderBy(
          desc(sql`${priceDropEvents.previousPriceMinor} - ${priceDropEvents.newPriceMinor}`),
        ),
      db
        .select({ tarz1: boutiques.tarz1, tarz2: boutiques.tarz2 })
        .from(savedProducts)
        .innerJoin(boutiques, eq(boutiques.id, savedProducts.boutiqueId))
        .where(eq(savedProducts.userId, userId)),
      db.select({ adet: count() }).from(collections).where(eq(collections.userId, userId)),
      db
        .select({ adet: count() })
        .from(comments)
        .where(and(eq(comments.userId, userId), isNull(comments.deletedAt))),
      db
        .select({
          boutiqueId: sql<string>`${events.payload}->>'boutiqueId'`,
          sonGorulme: sql<string>`max(${events.createdAt})`,
        })
        .from(events)
        .where(
          and(
            eq(events.userId, userId),
            eq(events.type, 'boutique_view'),
            sql`${events.payload}->>'boutiqueId' is not null`,
          ),
        )
        .groupBy(sql`${events.payload}->>'boutiqueId'`)
        .orderBy(desc(sql`max(${events.createdAt})`))
        .limit(8),
    ]);

  const sonTest = await sonTarzTesti(userId);
  const sayim = sayimlar[0] ?? { kayitli: 0, takipte: 0, yolda: 0, teslim: 0 };
  const kazanc = kazanciTopla(dususler);
  const sonGezilen = gezilenler.length
    ? await db
        .select({ id: boutiques.id, name: boutiques.name, coverImageUrl: boutiques.coverImageUrl })
        .from(boutiques)
        .where(
          and(
            inArray(
              boutiques.id,
              gezilenler.map((g) => g.boutiqueId),
            ),
            eq(boutiques.isActive, true),
          ),
        )
    : [];
  // Sıra "en son gezilen" olmalı; SQL'den gelen sıra korunmaz.
  const sira = new Map(gezilenler.map((g, i) => [g.boutiqueId, i]));
  sonGezilen.sort((a, b) => (sira.get(a.id) ?? 99) - (sira.get(b.id) ?? 99));

  return c.json({
    takip: {
      adet: Number(sayim.takipte),
      dususAdedi: kazanc.dususAdedi,
      sonOtuzGunDususMinor: kazanc.toplamMinor,
      paraBirimi: kazanc.paraBirimi,
      ornekler: dususler.slice(0, 2).map((d) => ({
        savedProductId: d.savedProductId,
        baslik: d.baslik,
        eskiMinor: d.previousPriceMinor,
        yeniMinor: d.newPriceMinor,
      })),
    },
    siparis: { yolda: Number(sayim.yolda), teslim: Number(sayim.teslim) },
    tarz: {
      test: sonTest ? { birincil: sonTest.tarz1, ikincil: sonTest.tarz2 } : null,
      favori: tarziCikar(butikTarzlari),
    },
    rozetler: rozetleriHesapla({
      kayitliUrun: Number(sayim.kayitli),
      koleksiyon: Number(koleksiyonSayisi[0]?.adet ?? 0),
      yorum: Number(yorumSayisi[0]?.adet ?? 0),
      gezilenButik: gezilenler.length,
    }),
    sonGezilen,
  });
});

// /me/tarz-testi ve /me/oneriler — requireAuth yukarıdaki use('*') ile geçerli.
meRoutes.route('/', meTarzRoutes);
meRoutes.route('/', meDetayliTestRoutes);
