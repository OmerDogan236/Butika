import { expect, test } from 'bun:test';

// Yalnız adı butika_local ile başlayan yerel bir veritabanında (TEST-REHBERI.md).
const testUrl = process.env.BUTIKA_PAZAR_TEST_URL;
test.skipIf(!testUrl)(
  'fiyat işçisi ürünü butiğin pazarında okur, pazar dışı para birimini kaydetmez',
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
    const { users, countries, boutiques, savedProducts, trackedProducts, priceDropEvents } =
      await import('@butika/db');
    const { eq } = await import('drizzle-orm');
    const { runPriceTrackingBatch } = await import('./price-tracking-job');
    const { pazarBaglami } = await import('./pazar');
    type Resolve = NonNullable<Parameters<typeof runPriceTrackingBatch>[0]>['resolve'];

    const userId = crypto.randomUUID();
    const boutiqueId = crypto.randomUUID();
    const euroId = crypto.randomUUID();
    const dolarId = crypto.randomUUID();
    const productUrl = (id: string) => `https://pazar-${id}.example/products/x`;
    try {
      await db
        .insert(countries)
        .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
        .onConflictDoNothing();
      await db.insert(users).values({ id: userId, displayName: 'Pazar test' });
      await db.insert(boutiques).values({
        id: boutiqueId,
        countryCode: 'TR',
        name: 'Pazar test',
        url: 'https://pazar.example',
        coverImageUrl: '',
      });
      const past = new Date(Date.now() - 60_000);
      // Sunucu yurtdışında okuduğu için avro ve dolar kalmış iki eski kayıt.
      for (const [id, priceMinor, currency] of [
        [euroId, 1899, 'EUR'],
        [dolarId, 76589, 'USD'],
      ] as const) {
        await db.insert(trackedProducts).values({
          id,
          boutiqueId,
          canonicalUrl: productUrl(id),
          sourceUrl: productUrl(id),
          domain: `pazar-${id}.example`,
          title: 'Ürün',
          currentPriceMinor: priceMinor,
          currency,
          availability: 'in_stock',
          notificationBaselinePriceMinor: priceMinor,
          notificationBaselineCurrency: currency,
          notificationBaselineAt: past,
          lastSuccessAt: past,
          nextCheckAt: past,
        });
        await db
          .insert(savedProducts)
          .values({ userId, boutiqueId, trackedProductId: id, url: productUrl(id), title: 'Ürün' });
      }

      const gorulen: { url: string; ulke?: string; beklenen?: string | null }[] = [];
      const resolve: Resolve = async (context) => {
        gorulen.push({
          url: context.url,
          ulke: pazarBaglami.getStore()?.ulke,
          beklenen: context.expectedCurrency,
        });
        // Ticimax gibi: hâlâ avro. Shopify gibi: pazar çereziyle TL.
        const tl = context.url.includes(dolarId);
        return {
          status: 'success',
          attempts: [],
          observation: {
            priceMinor: tl ? 3_700_000 : 1899,
            currency: tl ? 'TRY' : 'EUR',
            availability: 'in_stock',
            observedAt: new Date(),
            provider: 'shopify',
          },
        };
      };
      const stats = await runPriceTrackingBatch({ resolve, limit: 1000 });
      expect(stats.selected).toBeGreaterThanOrEqual(2);

      // Her iki ürün de Türkiye pazarı bağlamında ve TL beklentisiyle okundu.
      for (const id of [euroId, dolarId])
        expect(gorulen.find((g) => g.url === productUrl(id))).toEqual({
          url: productUrl(id),
          ulke: 'TR',
          beklenen: 'TRY',
        });

      const [euro] = await db.select().from(trackedProducts).where(eq(trackedProducts.id, euroId));
      expect(euro!.consecutiveFailures).toBe(1);
      expect(euro!.lastError).toBe(
        'price_conflict: pazar_para_birimi: TRY bekleniyordu, EUR geldi',
      );
      // Yanlış para birimindeki eski fiyat artık gösterilmez.
      expect(euro!.currentPriceMinor).toBeNull();
      expect(euro!.currency).toBeNull();

      const [dolar] = await db
        .select()
        .from(trackedProducts)
        .where(eq(trackedProducts.id, dolarId));
      expect(dolar!.consecutiveFailures).toBe(0);
      expect(dolar!.currentPriceMinor).toBe(3_700_000);
      expect(dolar!.currency).toBe('TRY');
      expect(dolar!.notificationBaselineCurrency).toBe('TRY');

      // USD'den TRY'ye geçiş, rakam değişse de "fiyatı düştü" sayılmaz.
      for (const id of [euroId, dolarId])
        expect(
          await db.select().from(priceDropEvents).where(eq(priceDropEvents.trackedProductId, id)),
        ).toHaveLength(0);
    } finally {
      await db.delete(savedProducts).where(eq(savedProducts.userId, userId));
      for (const id of [euroId, dolarId]) {
        await db.delete(priceDropEvents).where(eq(priceDropEvents.trackedProductId, id));
        const { productPriceHistory } = await import('@butika/db');
        await db.delete(productPriceHistory).where(eq(productPriceHistory.trackedProductId, id));
        await db.delete(trackedProducts).where(eq(trackedProducts.id, id));
      }
      await db.delete(boutiques).where(eq(boutiques.id, boutiqueId));
      await db.delete(users).where(eq(users.id, userId));
    }
  },
);
