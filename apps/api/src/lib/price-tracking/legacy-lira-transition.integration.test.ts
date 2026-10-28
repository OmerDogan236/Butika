import { expect, test } from 'bun:test';
import { dilvinPage } from './dilvin-lira.fixture';

// Run separately against a disposable, migrated local database (see
// docs/bildirim-sistemi.md). Products first tracked under Dilvin's retired TRL
// label move to TRY: the move itself is never a price drop, even to a lower
// amount, a push queued for the old currency is not delivered, the next drop is
// counted in TRY, and stock returning with the move keeps the restock rules.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('TRL to TRY transition sends no drop notification and drops the old push', async () => {
  const url = new URL(testUrl!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/butika_notification_test')) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl) throw new Error('Run this integration file separately');
  const { db } = await import('../db');
  const { users, countries, boutiques, savedProducts, trackedProducts, notifications, priceDropEvents, restockEvents, pushDevices, pushOutbox } = await import('@butika/db');
  const { eq, and, inArray } = await import('drizzle-orm');
  const { ensureTrackedProduct } = await import('./tracked-product');
  const { recordPriceObservation } = await import('./record-price-observation');
  const { resolveProductPrice } = await import('./price-source-router');
  const { extractProductHtml } = await import('./extract-product-price');
  const { structuredHtmlPriceProvider } = await import('./providers/structured-html-provider');
  const { runPushOutboxBatch } = await import('../push/push-outbox-worker');

  const ids = { boutique: crypto.randomUUID(), user: crypto.randomUUID() };
  const token = `ExponentPushToken[${ids.user}]`;
  const realFetch = globalThis.fetch;
  const realGetPrice = structuredHtmlPriceProvider.getPrice;
  const sent: string[] = [];
  const start = Date.now();
  try {
    await db.insert(countries).values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' }).onConflictDoNothing();
    await db.insert(boutiques).values({ id: ids.boutique, countryCode: 'TR', name: 'Lira test', url: 'https://www.dilvin.com.tr', coverImageUrl: '' });
    await db.insert(users).values({ id: ids.user, displayName: 'Lira test' });
    await db.insert(pushDevices).values({ userId: ids.user, installationId: crypto.randomUUID(), expoPushToken: token, platform: 'android' });
    const watch = async (slug: string) => {
      const productUrl = `https://www.dilvin.com.tr/${slug}-${ids.user.slice(0, 8)}`;
      const id = await ensureTrackedProduct({ boutiqueId: ids.boutique, url: productUrl, title: 'Degaje Yaka Top', priceMinor: 59999, currency: 'TRY' });
      expect(id).not.toBeNull();
      await db.insert(savedProducts).values({ userId: ids.user, boutiqueId: ids.boutique, url: productUrl, title: 'Degaje Yaka Top',
        trackedProductId: id!, trackingStartedAt: new Date(start - 60_000) });
      return id!;
    };
    const product = async (id: string) => (await db.select().from(trackedProducts).where(eq(trackedProducts.id, id)))[0]!;
    const drops = (id: string) => db.select().from(priceDropEvents).where(eq(priceDropEvents.trackedProductId, id));
    const inbox = () => db.select().from(notifications).where(eq(notifications.userId, ids.user));
    // What the previous reader stored for these pages: amounts labelled TRL.
    const observeTrl = (id: string, priceMinor: number, offset: number) => recordPriceObservation({ trackedProductId: id,
      priceMinor, currency: 'TRL', availability: 'in_stock', observedAt: new Date(start + offset) });
    // The current reader on the same page. The stored expectation goes through
    // the real router, as in a scheduled check.
    const check = async (id: string, price: string, visible: string, offset: number) => {
      structuredHtmlPriceProvider.getPrice = async (context) => {
        const read = extractProductHtml(dilvinPage({ url: context.url, price, visible }), context.url);
        if (read.status !== 'success') return { status: 'failure', reason: read.status, error: read.error };
        return { status: 'success', observation: { availability: read.availability ?? 'unknown', priceMinor: read.priceMinor,
          currency: read.currency, observedAt: new Date(start + offset), provider: 'structured_html', method: read.source } };
      };
      const tracked = await product(id);
      const resolution = await resolveProductPrice({ url: tracked.sourceUrl, expectedCurrency: tracked.currency, trackedProductId: tracked.id });
      if (resolution.status !== 'success') throw new Error(`resolution failed: ${resolution.error}`);
      await recordPriceObservation({ trackedProductId: tracked.id, priceMinor: resolution.observation.priceMinor,
        currency: resolution.observation.currency, availability: resolution.observation.availability, observedAt: resolution.observation.observedAt });
      return { expected: tracked.currency, observation: resolution.observation };
    };

    // 1. A move to a lower TRY amount is not a drop; the TRY baseline starts there.
    const lower = await watch('lira-lower');
    await observeTrl(lower, 59999, 1000);
    expect(await check(lower, '529.99', '529,99 TL', 2000))
      .toMatchObject({ expected: 'TRL', observation: { priceMinor: 52999, currency: 'TRY', availability: 'in_stock' } });
    expect(await product(lower)).toMatchObject({ currency: 'TRY', notificationBaselineCurrency: 'TRY', notificationBaselinePriceMinor: 52999 });
    expect(await drops(lower)).toHaveLength(0);
    expect(await inbox()).toHaveLength(0);

    // 2. A push queued for a TRL drop is not delivered once the same amount reads
    //    as TRY: only the currency differs.
    const queuedFor = await watch('lira-queued');
    await observeTrl(queuedFor, 59999, 1000);
    await observeTrl(queuedFor, 54999, 2000);
    expect(await drops(queuedFor)).toHaveLength(1);
    expect(await inbox()).toHaveLength(1);
    const [queued] = await db.select({ id: pushOutbox.id }).from(pushOutbox).innerJoin(pushDevices, eq(pushDevices.id, pushOutbox.deviceId))
      .where(and(eq(pushDevices.userId, ids.user), eq(pushOutbox.status, 'pending')));
    expect(queued).toBeDefined();
    expect(await check(queuedFor, '549.99', '549,99 TL', 3000)).toMatchObject({ observation: { priceMinor: 54999, currency: 'TRY' } });
    expect(await drops(queuedFor)).toHaveLength(1);
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(input) !== 'https://exp.host/--/api/v2/push/send') throw new Error('Unexpected network request in test');
      const batch = JSON.parse(String(init?.body)) as Array<{ to: string }>;
      sent.push(...batch.map(message => message.to));
      return Response.json({ data: batch.map(() => ({ status: 'ok', id: crypto.randomUUID() })) });
    }) as typeof fetch;
    await runPushOutboxBatch();
    expect(sent).not.toContain(token);
    expect((await db.select().from(pushOutbox).where(eq(pushOutbox.id, queued!.id)))[0])
      .toMatchObject({ status: 'cancelled', lastError: 'NoLongerEligible' });

    // 3. The next lower TRY price is an ordinary drop against the TRY baseline.
    expect(await check(lower, '499.99', '499,99 TL', 4000)).toMatchObject({ expected: 'TRY', observation: { priceMinor: 49999, currency: 'TRY' } });
    expect(await drops(lower)).toEqual([expect.objectContaining({ currency: 'TRY', previousPriceMinor: 52999, newPriceMinor: 49999 })]);
    expect(await inbox()).toHaveLength(2);

    // 4. Verified stock returning with the move keeps the restock rules: one
    //    back_in_stock notification, no price drop, and the push shows no
    //    TRL → TRY "old → new" price.
    const restock = await watch('lira-restock');
    await observeTrl(restock, 59999, 1000);
    await db.update(savedProducts).set({ restockAlertAt: new Date(start + 1500) }).where(eq(savedProducts.trackedProductId, restock));
    await recordPriceObservation({ trackedProductId: restock, priceMinor: 59999, currency: 'TRL', availability: 'out_of_stock', observedAt: new Date(start + 2000) });
    expect((await db.select().from(savedProducts).where(eq(savedProducts.trackedProductId, restock)))[0]!.restockConfirmedAt).not.toBeNull();
    expect(await check(restock, '529.99', '529,99 TL', 3000)).toMatchObject({ expected: 'TRL', observation: { priceMinor: 52999, currency: 'TRY', availability: 'in_stock' } });
    expect(await drops(restock)).toHaveLength(0);
    expect(await db.select().from(restockEvents).where(eq(restockEvents.trackedProductId, restock)))
      .toEqual([expect.objectContaining({ currency: 'TRY', priceMinor: 52999, previousPriceMinor: null })]);
    const backInStock = (await inbox()).filter(row => row.type === 'back_in_stock');
    expect(backInStock).toHaveLength(1);
    expect(await inbox()).toHaveLength(3);
    const [job] = await db.select({ message: pushOutbox.message }).from(pushOutbox).where(eq(pushOutbox.notificationId, backInStock[0]!.id));
    expect((job!.message as { body: string }).body).not.toContain('→');
  } finally {
    globalThis.fetch = realFetch;
    structuredHtmlPriceProvider.getPrice = realGetPrice;
    await db.delete(users).where(inArray(users.id, [ids.user]));
    await db.delete(trackedProducts).where(eq(trackedProducts.boutiqueId, ids.boutique));
    await db.delete(boutiques).where(eq(boutiques.id, ids.boutique));
  }
}, 30000);
