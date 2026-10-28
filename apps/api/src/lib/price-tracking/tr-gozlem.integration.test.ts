import { expect, test } from 'bun:test';

// Yalnız adı butika_local ile başlayan yerel bir veritabanında (TEST-REHBERI.md).
const testUrl = process.env.BUTIKA_PAZAR_TEST_URL;
test.skipIf(!testUrl)(
  'Türkiye gözlemi normal akıştan geçer: ilk TL taban olur, sonraki düşüş bildirim ve push üretir',
  async () => {
    const url = new URL(testUrl!);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !url.pathname.startsWith('/butika_local')
    )
      throw new Error('Yerel butika_local test veritabanı gerekli');
    process.env.DATABASE_URL = testUrl;
    const { env } = await import('../../env');
    if (env.DATABASE_URL !== testUrl) throw new Error('Bu dosyayı ayrı çalıştırın');
    const { db } = await import('../db');
    const schema = await import('@butika/db');
    const {
      users,
      countries,
      boutiques,
      savedProducts,
      trackedProducts,
      priceDropEvents,
      notifications,
      pushDevices,
      pushOutbox,
      productPriceHistory,
    } = schema;
    const { eq, inArray } = await import('drizzle-orm');
    const { trGozlemleriIsle } = await import('./tr-gozlem');

    const userId = crypto.randomUUID();
    const boutiqueId = crypto.randomUUID();
    const id = crypto.randomUUID();
    const productUrl = `https://tr-gozlem-${id}.example/urun`;
    const t = (dk: number) => new Date(Date.now() - dk * 60_000);
    try {
      await db
        .insert(countries)
        .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
        .onConflictDoNothing();
      await db.insert(users).values({ id: userId, displayName: 'TR gözlem test' });
      await db.insert(pushDevices).values({
        userId,
        installationId: crypto.randomUUID(),
        expoPushToken: `ExponentPushToken[test-${id}]`,
        platform: 'ios',
      });
      await db.insert(boutiques).values({
        id: boutiqueId,
        countryCode: 'TR',
        name: 'TR gözlem',
        url: 'https://tr-gozlem.example',
        coverImageUrl: '',
      });
      // Sunucunun yurtdışından okuduğu eski avro kaydı (düzeltmeden sonra fiyatı temizlenmiş).
      await db.insert(trackedProducts).values({
        id,
        boutiqueId,
        canonicalUrl: productUrl,
        sourceUrl: productUrl,
        domain: `tr-gozlem-${id}.example`,
        title: 'Kazak',
        availability: 'in_stock',
        notificationBaselinePriceMinor: 2299,
        notificationBaselineCurrency: 'EUR',
        notificationBaselineAt: t(60 * 24 * 5),
        lastSuccessAt: t(60 * 24),
        lastError: 'price_conflict: pazar_para_birimi: TRY bekleniyordu, EUR geldi',
        consecutiveFailures: 1,
      });
      await db.insert(savedProducts).values({
        userId,
        boutiqueId,
        trackedProductId: id,
        url: productUrl,
        title: 'Kazak',
        trackingStartedAt: t(60 * 24 * 6),
      });

      // Kuru çalışma hiçbir şey yazmaz.
      const kuru = await trGozlemleriIsle(
        [
          {
            id,
            priceMinor: 119900,
            currency: 'TRY',
            availability: 'in_stock',
            observedAt: t(5).toISOString(),
          },
        ],
        { kaydet: false },
      );
      expect(kuru).toEqual([{ id, durum: 'kuru' }]);
      expect(
        (await db.select().from(trackedProducts).where(eq(trackedProducts.id, id)))[0]!.currency,
      ).toBeNull();

      // Avro gözlemi reddedilir.
      const avro = await trGozlemleriIsle(
        [
          {
            id,
            priceMinor: 2299,
            currency: 'EUR',
            availability: 'in_stock',
            observedAt: t(5).toISOString(),
          },
        ],
        { kaydet: true },
      );
      expect(avro[0]!.durum).toBe('reddedildi');

      // İlk TL gözlemi tabanı kurar; avrodan TL'ye geçiş indirim değildir.
      const ilk = await trGozlemleriIsle(
        [
          {
            id,
            priceMinor: 119900,
            currency: 'TRY',
            availability: 'in_stock',
            observedAt: t(4).toISOString(),
          },
        ],
        { kaydet: true },
      );
      expect(ilk).toEqual([{ id, durum: 'kaydedildi', indirimBildirimi: 0 }]);
      const [kurulan] = await db.select().from(trackedProducts).where(eq(trackedProducts.id, id));
      expect(kurulan).toMatchObject({
        currentPriceMinor: 119900,
        currency: 'TRY',
        notificationBaselineCurrency: 'TRY',
        consecutiveFailures: 0,
        lastError: null,
      });

      // Ertesi gözlemde gerçek TL düşüşü: kayıt eden kullanıcıya bildirim ve telefonuna push sırası.
      const dusus = await trGozlemleriIsle(
        [
          {
            id,
            priceMinor: 95900,
            currency: 'TRY',
            availability: 'in_stock',
            observedAt: t(1).toISOString(),
          },
        ],
        { kaydet: true },
      );
      expect(dusus).toEqual([{ id, durum: 'kaydedildi', indirimBildirimi: 1 }]);
      const olaylar = await db
        .select()
        .from(priceDropEvents)
        .where(eq(priceDropEvents.trackedProductId, id));
      expect(olaylar.map((e) => [e.previousPriceMinor, e.newPriceMinor, e.currency])).toEqual([
        [119900, 95900, 'TRY'],
      ]);
      const bildirimler = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId));
      expect(bildirimler).toHaveLength(1);
      expect(
        await db
          .select()
          .from(pushOutbox)
          .where(
            inArray(
              pushOutbox.notificationId,
              bildirimler.map((n) => n.id),
            ),
          ),
      ).toHaveLength(1);
    } finally {
      const bildirimler = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(eq(notifications.userId, userId));
      if (bildirimler.length)
        await db.delete(pushOutbox).where(
          inArray(
            pushOutbox.notificationId,
            bildirimler.map((n) => n.id),
          ),
        );
      await db.delete(notifications).where(eq(notifications.userId, userId));
      await db.delete(priceDropEvents).where(eq(priceDropEvents.trackedProductId, id));
      await db.delete(productPriceHistory).where(eq(productPriceHistory.trackedProductId, id));
      await db.delete(savedProducts).where(eq(savedProducts.userId, userId));
      await db.delete(trackedProducts).where(eq(trackedProducts.id, id));
      await db.delete(pushDevices).where(eq(pushDevices.userId, userId));
      await db.delete(boutiques).where(eq(boutiques.id, boutiqueId));
      await db.delete(users).where(eq(users.id, userId));
    }
  },
);
