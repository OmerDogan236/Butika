import { expect, test } from 'bun:test';

// Run separately against a disposable, migrated local database (see
// docs/bildirim-sistemi.md). The real reader output reaches the observation
// through the scheduler: a product tracked with prices but without verified stock
// has no baseline, so the first definite in-stock reading starts one without a
// price drop against that history, and a later lower in-stock price is a drop.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('the first verified stock after unknown-stock history is a baseline, not a drop', async () => {
  const url = new URL(testUrl!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/butika_notification_test')) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl) throw new Error('Run this integration file separately');
  const { db } = await import('../db');
  const { users, countries, boutiques, savedProducts, trackedProducts, notifications, priceDropEvents, pushDevices, pushOutbox } = await import('@butika/db');
  const { eq, inArray } = await import('drizzle-orm');
  const { ensureTrackedProduct } = await import('./tracked-product');
  const { runPriceTrackingBatch } = await import('./price-tracking-job');
  const { resolveProductPrice } = await import('./price-source-router');

  const ids = { boutique: crypto.randomUUID(), user: crypto.randomUUID() };
  const host = `schema-stock-${ids.boutique.slice(0, 8)}.example`;
  const productUrl = `https://www.${host}/urun/triko-elbise`;
  // og:price plus the page's own ProductGroup: the older meta reader gives the
  // price, the group can only add the stock it proves for that same amount.
  let price = '700.00';
  let stock: [string, string] = ['InStock', 'OutOfStock'];
  const page = () => {
    const group = { '@context': 'https://schema.org', '@type': 'ProductGroup', url: productUrl,
      hasVariant: stock.map((state, i) => ({ '@type': 'Product', sku: `TRIKO-${i}`,
        offers: { '@type': 'Offer', price, priceCurrency: 'TRY', availability: `https://schema.org/${state}`, url: `${productUrl}?beden=${i}` } })) };
    return `<html><head><link rel="canonical" href="${productUrl}"><meta property="product:price:amount" content="${price}">` +
      `<meta property="product:price:currency" content="TRY"><script type="application/ld+json">${JSON.stringify(group)}</script></head><body></body></html>`;
  };
  const realFetch = globalThis.fetch;
  let productId: string | null = null;
  try {
    await db.insert(countries).values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' }).onConflictDoNothing();
    await db.insert(boutiques).values({ id: ids.boutique, countryCode: 'TR', name: 'Schema stock', url: `https://www.${host}`, coverImageUrl: '' });
    await db.insert(users).values({ id: ids.user, displayName: 'Schema stock' });
    productId = await ensureTrackedProduct({ boutiqueId: ids.boutique, url: productUrl, title: 'Triko elbise', priceMinor: 70000, currency: 'TRY' });
    expect(productId).not.toBeNull();
    await db.insert(savedProducts).values({ userId: ids.user, boutiqueId: ids.boutique, url: productUrl, title: 'Triko elbise',
      trackedProductId: productId!, trackingStartedAt: new Date(Date.now() - 60_000) });
    await db.insert(pushDevices).values({ userId: ids.user, installationId: crypto.randomUUID(), expoPushToken: `ExponentPushToken[${ids.user}]`, platform: 'android' });
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      if (String(input) !== productUrl) return new Response('not found', { status: 404 });
      return new Response(page(), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }) as typeof fetch;
    const check = async () => {
      await db.update(trackedProducts).set({ nextCheckAt: new Date(0), checkLeaseUntil: null, checkLeaseToken: null }).where(eq(trackedProducts.id, productId!));
      const batch = await runPriceTrackingBatch({ resolve: resolveProductPrice });
      expect(batch).toMatchObject({ selected: 1, success: 1 });
    };
    const tracked = async () => (await db.select({ price: trackedProducts.currentPriceMinor, availability: trackedProducts.availability,
      baseline: trackedProducts.notificationBaselinePriceMinor }).from(trackedProducts).where(eq(trackedProducts.id, productId!)))[0]!;
    const drops = () => db.select().from(priceDropEvents).where(eq(priceDropEvents.trackedProductId, productId!));
    const inbox = () => db.select().from(notifications).where(eq(notifications.userId, ids.user));

    // 1. Mixed variant stock proves nothing: price history, no baseline.
    await check();
    expect(await tracked()).toEqual({ price: 70000, availability: 'unknown', baseline: null });

    // 2. Lower price, every variant in stock: the first verified in-stock price is
    //    the baseline. The unverified 700.00 history is not compared.
    price = '600.00'; stock = ['InStock', 'InStock'];
    await check();
    expect(await tracked()).toEqual({ price: 60000, availability: 'in_stock', baseline: 60000 });
    expect(await drops()).toHaveLength(0);
    expect(await inbox()).toHaveLength(0);

    // 3. A later lower in-stock price is an ordinary drop with one push queued.
    price = '550.00';
    await check();
    expect(await drops()).toEqual([expect.objectContaining({ previousPriceMinor: 60000, newPriceMinor: 55000, currency: 'TRY' })]);
    expect(await inbox()).toHaveLength(1);
    expect(await db.select().from(pushOutbox).innerJoin(pushDevices, eq(pushDevices.id, pushOutbox.deviceId))
      .where(eq(pushDevices.userId, ids.user))).toHaveLength(1);
  } finally {
    globalThis.fetch = realFetch;
    await db.delete(users).where(inArray(users.id, [ids.user]));
    await db.delete(trackedProducts).where(eq(trackedProducts.boutiqueId, ids.boutique));
    await db.delete(boutiques).where(eq(boutiques.id, ids.boutique));
  }
}, 30000);
