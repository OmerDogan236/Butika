import { expect, test } from 'bun:test';

// A newinshop.co product that asks for a size, through the real save and alert
// routes, the real price check and the real observation recorder. The pages are
// fixtures built on the page fetched 2026-09-25; every price and stock state here is
// made up. The question is narrow: a lower price read with the size stock withheld
// (unknown) must produce no price or stock notification and no queued push, and must
// neither fire nor clear a stock alert that is already armed. record-price-observation
// and the alert contract are used as they are. No push leaves the process. The file
// removes its own accounts, boutique, tracking, events and queue rows.
// Run this file separately against a disposable, migrated local database
// (docs/bildirim-sistemi.md, "Test"). Never use the development or production database.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('a newinshop product that asks for a size: a lower price with withheld stock notifies nobody', async () => {
  const url = new URL(testUrl!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/butika_notification_test')) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl) {
    throw new Error('Database configuration was already loaded; run this test file separately');
  }
  const { db } = await import('../db');
  const { runPriceTrackingBatch } = await import('./price-tracking-job');
  const { savedRoutes } = await import('../../routes/saved');
  const { signAccessToken } = await import('../jwt');
  const { errorResponse } = await import('../errors');
  const { Hono } = await import('hono');
  const { and, eq, inArray, or } = await import('drizzle-orm');
  const { users, countries, boutiques, trackedProducts, savedProducts, notifications, pushDevices, pushOutbox,
    restockEvents, priceDropEvents } = await import('@butika/db');
  const { NEWINSHOP_URL, newinshopPage } = await import('./newinshop.fixture');

  const app = new Hono().route('/saved', savedRoutes);
  app.onError((err, c) => errorResponse(c, err));
  const ids = { boutique: crypto.randomUUID(), price: crypto.randomUUID(), alert: crypto.randomUUID() };

  // The store's answer, switched per phase. Only the product page may be requested.
  let page = newinshopPage({ sizes: null });
  const pushes: unknown[] = [];
  const requested: string[] = [];
  const unexpected: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const href = String(input instanceof Request ? input.url : input);
    if (href === 'https://exp.host/--/api/v2/push/send') {
      pushes.push(...(JSON.parse(String(init?.body)) as unknown[]));
      return Response.json({ data: [] });
    }
    if (href === NEWINSHOP_URL) { requested.push(href); return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } }); }
    unexpected.push(href);
    throw new Error(`Unexpected network request in test: ${href}`);
  }) as typeof fetch;

  let tracked: string | undefined;
  try {
    await db.insert(countries).values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' }).onConflictDoNothing();
    await db.insert(boutiques).values({ id: ids.boutique, countryCode: 'TR', name: 'newinshop beden testi', url: 'https://www.newinshop.co', coverImageUrl: '' });
    await db.insert(users).values([{ id: ids.price, displayName: 'newinshop fiyat izleyen' }, { id: ids.alert, displayName: 'newinshop stok alarmı' }]);
    const device = async (userId: string) => (await db.insert(pushDevices).values({ userId, installationId: crypto.randomUUID(),
      expoPushToken: `ExponentPushToken[${userId}]`, platform: 'android' }).returning({ id: pushDevices.id }))[0]!.id;
    const devices = { price: await device(ids.price), alert: await device(ids.alert) };
    const tokens = { price: await signAccessToken(ids.price), alert: await signAccessToken(ids.alert) };
    const call = (token: string, path: string, method = 'GET', body?: unknown) => app.request(path, { method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const save = async (token: string) => {
      const response = await call(token, '/saved', 'POST', { boutiqueId: ids.boutique, url: NEWINSHOP_URL, title: 'Balıksırtı Desenli Yelek' });
      return { status: response.status, body: await response.json() as { id: string } };
    };
    const saved = async (savedId: string) => (await db.select({ tracked: savedProducts.trackedProductId, armed: savedProducts.restockAlertAt,
      confirmed: savedProducts.restockConfirmedAt }).from(savedProducts).where(eq(savedProducts.id, savedId)))[0]!;
    const state = async () => (await db.select({ price: trackedProducts.currentPriceMinor, availability: trackedProducts.availability,
      baseline: trackedProducts.notificationBaselinePriceMinor, baselineAt: trackedProducts.notificationBaselineAt })
      .from(trackedProducts).where(eq(trackedProducts.id, tracked!)))[0]!;
    const check = async (next: string) => {
      page = next;
      await db.update(trackedProducts).set({ nextCheckAt: new Date(Date.now() - 60_000), checkLeaseToken: null, checkLeaseUntil: null })
        .where(eq(trackedProducts.id, tracked!));
      return runPriceTrackingBatch();
    };
    // A notification belongs to this product only through its own event, a restock
    // or a price drop; distinct notification and outbox ids, so a join never counts twice.
    const counted = async (userId: string) => {
      const rows = await db.select({ id: notifications.id, type: notifications.type, outboxId: pushOutbox.id, deviceId: pushOutbox.deviceId })
        .from(notifications)
        .leftJoin(restockEvents, eq(restockEvents.id, notifications.restockEventId))
        .leftJoin(priceDropEvents, eq(priceDropEvents.id, notifications.priceDropEventId))
        .leftJoin(pushOutbox, eq(pushOutbox.notificationId, notifications.id))
        .where(and(eq(notifications.userId, userId), or(eq(restockEvents.trackedProductId, tracked!), eq(priceDropEvents.trackedProductId, tracked!))));
      return { notifications: new Set(rows.map(r => r.id)).size, outbox: new Set(rows.map(r => r.outboxId).filter(Boolean)).size,
        types: [...new Set(rows.map(r => r.type))].sort(), devices: [...new Set(rows.map(r => r.deviceId).filter(Boolean))] };
    };
    const events = async () => ({
      drops: (await db.select({ id: priceDropEvents.id }).from(priceDropEvents).where(eq(priceDropEvents.trackedProductId, tracked!))).length,
      restocks: (await db.select({ id: restockEvents.id }).from(restockEvents).where(eq(restockEvents.trackedProductId, tracked!))).length,
    });
    // Both accounts' rows without any product: each must belong to this product.
    const totals = async () => ({
      notifications: (await db.select({ id: notifications.id }).from(notifications).where(inArray(notifications.userId, [ids.price, ids.alert]))).length,
      outbox: (await db.select({ id: pushOutbox.id }).from(pushOutbox).innerJoin(notifications, eq(notifications.id, pushOutbox.notificationId))
        .where(inArray(notifications.userId, [ids.price, ids.alert]))).length,
    });
    const none = { notifications: 0, outbox: 0, types: [], devices: [] };

    // ── 1. Both accounts save the product; one tracking. Made-up history: the page
    // had no size yet and stated stock for the product, so a baseline exists.
    const priceWatch = await save(tokens.price);
    const alertWatch = await save(tokens.alert);
    expect([priceWatch.status, alertWatch.status]).toEqual([201, 201]);
    tracked = (await saved(priceWatch.body.id)).tracked!;
    expect((await saved(alertWatch.body.id)).tracked).toBe(tracked);
    expect(await check(newinshopPage({ sizes: null, price: '5550.00', availability: 'InStock' }))).toMatchObject({ selected: 1, success: 1 });
    expect(await state()).toMatchObject({ price: 555000, availability: 'in_stock', baseline: 555000 });
    const baselineAt = (await state()).baselineAt;

    // ── 2. Sold out, then the alert: armed and confirmed by the server's own check.
    expect(await check(newinshopPage({ sizes: null, price: '5550.00', availability: 'OutOfStock' }))).toMatchObject({ selected: 1, success: 1 });
    expect((await state()).availability).toBe('out_of_stock');
    expect((await call(tokens.alert, `/saved/${alertWatch.body.id}/restock-alert`, 'PUT')).status).toBe(200);
    const alert = await saved(alertWatch.body.id);
    expect(alert.armed).toBeInstanceOf(Date);
    expect(alert.confirmed).toBeInstanceOf(Date);
    expect(await totals()).toEqual({ notifications: 0, outbox: 0 });

    // ── 3. The page now asks for a size. The product says in stock at a lower
    // price: the price is recorded, the stock is withheld, nobody is told.
    const sized = (price: string, availability: string) => newinshopPage({ price, availability });
    expect(await check(sized('4990.00', 'InStock'))).toMatchObject({ selected: 1, success: 1 });
    expect(await state()).toMatchObject({ price: 499000, availability: 'unknown', baseline: 555000, baselineAt });
    expect(await events()).toEqual({ drops: 0, restocks: 0 });
    expect([await counted(ids.price), await counted(ids.alert)]).toEqual([none, none]);
    expect(await saved(alertWatch.body.id)).toEqual(alert);
    // Out of stock for the product is no size's state either, and the same answer twice changes nothing.
    expect(await check(sized('4790.00', 'OutOfStock'))).toMatchObject({ selected: 1, success: 1 });
    expect(await check(sized('4790.00', 'OutOfStock'))).toMatchObject({ selected: 1, success: 1 });
    expect(await state()).toMatchObject({ price: 479000, availability: 'unknown', baseline: 555000, baselineAt });
    expect(await events()).toEqual({ drops: 0, restocks: 0 });
    expect(await totals()).toEqual({ notifications: 0, outbox: 0 });
    expect(await saved(alertWatch.body.id)).toEqual(alert);

    // ── 4. Control, also made up: the size select is gone and the product is in
    // stock at the lower price. The alert armed in step 2 fires once, the price
    // watcher gets the drop, each through its own event and its own device.
    expect(await check(newinshopPage({ sizes: null, price: '4790.00', availability: 'InStock' }))).toMatchObject({ selected: 1, success: 1 });
    expect(await state()).toMatchObject({ price: 479000, availability: 'in_stock', baseline: 479000 });
    expect(await events()).toEqual({ drops: 1, restocks: 1 });
    expect(await counted(ids.price)).toEqual({ notifications: 1, outbox: 1, types: ['price_drop'], devices: [devices.price] });
    expect(await counted(ids.alert)).toEqual({ notifications: 1, outbox: 1, types: ['back_in_stock'], devices: [devices.alert] });
    expect(await totals()).toEqual({ notifications: 2, outbox: 2 });
    expect(await saved(alertWatch.body.id)).toMatchObject({ armed: null, confirmed: null });

    // Only the product page was asked for; no push left the process.
    expect(requested.length).toBe(6);
    expect(unexpected).toEqual([]);
    expect(pushes).toEqual([]);
  } finally {
    globalThis.fetch = realFetch;
    // Only this scenario's own rows; the shared country is left untouched.
    if (tracked) await db.delete(trackedProducts).where(eq(trackedProducts.id, tracked));
    await db.delete(users).where(inArray(users.id, [ids.price, ids.alert]));
    await db.delete(boutiques).where(eq(boutiques.id, ids.boutique));
  }
}, 60000);
