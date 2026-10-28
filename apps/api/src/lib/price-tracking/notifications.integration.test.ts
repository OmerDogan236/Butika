import { expect, test } from 'bun:test';
import type { NotificationPage } from '@butika/types';

// Run this file separately against a disposable, migrated local database.
// Never use the development or production database for these fixtures.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('price drops, watcher isolation, inbox pagination and concurrent observations', async () => {
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
  const { recordPriceObservation } = await import('./record-price-observation');
  const { runPushOutboxBatch } = await import('../push/push-outbox-worker');
  const { ensureTrackedProduct } = await import('./tracked-product');
  const { notificationRoutes } = await import('../../routes/notifications');
  const { signAccessToken } = await import('../jwt');
  const { errorResponse } = await import('../errors');
  const { Hono } = await import('hono');
  const { eq, inArray } = await import('drizzle-orm');
  const { users, countries, boutiques, trackedProducts, savedProducts, notifications, priceDropEvents, pushDevices, pushOutbox } = await import('@butika/db');
  const app = new Hono().route('/notifications', notificationRoutes);
  app.onError((err, c) => errorResponse(c, err));
  const ids = { boutique: crypto.randomUUID(), a: crypto.randomUUID(), b: crypto.randomUUID(), outsider: crypto.randomUUID() };
  let productId: string | null = null;
  const variantProductIds: string[] = [];
  const realFetch = globalThis.fetch;
  const pushes: Array<{ to: string; data: { eventId: string } }> = [];
  let sendStatus = 200;
  let receipt: 'ok' | 'missing' | 'DeviceNotRegistered' = 'ok';
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input) === 'https://exp.host/--/api/v2/push/getReceipts') {
      const { ids } = JSON.parse(String(init?.body));
      return Response.json({ data: receipt === 'missing' ? {} : Object.fromEntries(ids.map((id: string) =>
        [id, receipt === 'ok' ? { status: 'ok' } : { status: 'error', details: { error: receipt } }])) });
    }
    if (String(input) !== 'https://exp.host/--/api/v2/push/send') throw new Error('Unexpected network request in test');
    const batch = JSON.parse(String(init?.body));
    pushes.push(...batch);
    if (sendStatus !== 200) return new Response('', { status: sendStatus });
    return Response.json({ data: batch.map(() => ({ status: 'ok', id: crypto.randomUUID() })) });
  }) as typeof fetch;
  try {
    await db.insert(countries).values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' }).onConflictDoNothing();
    await db.insert(boutiques).values({ id: ids.boutique, countryCode: 'TR', name: 'Bildirim Test Butiği', url: 'https://example.com', coverImageUrl: '' });
    await db.insert(users).values([ids.a, ids.b, ids.outsider].map((id) => ({ id, displayName: 'Notification test' })));
    for (const userId of [ids.a, ids.b]) {
      await db.insert(pushDevices).values({ userId, installationId: crypto.randomUUID(), expoPushToken: `ExponentPushToken[${userId}]`, platform: 'android' });
    }
    const sourceUrl = `https://example.com/products/${crypto.randomUUID()}`;
    productId = await ensureTrackedProduct({ boutiqueId: ids.boutique, url: sourceUrl, title: 'Test ürün', priceMinor: 999999, currency: 'TRY' });
    expect(productId).not.toBeNull();
    const [initial] = await db.select().from(trackedProducts).where(eq(trackedProducts.id, productId!));
    expect(initial!.currentPriceMinor).toBeNull(); // Client price is not a trusted baseline.
    for (const variant of ['123', '456']) {
      const id = await ensureTrackedProduct({ boutiqueId: ids.boutique, url: `${sourceUrl}?variant=${variant}`, title: `Test ${variant}`, priceMinor: 100, currency: 'TRY' });
      expect(id).not.toBeNull();
      variantProductIds.push(id!);
    }
    expect(new Set([productId, ...variantProductIds]).size).toBe(3);
    const variantProducts = await db.select().from(trackedProducts).where(inArray(trackedProducts.id, variantProductIds));
    expect(variantProducts.every(product => product.currentPriceMinor === null)).toBe(true);
    expect(await ensureTrackedProduct({ boutiqueId: ids.boutique, url: `${sourceUrl}?utm_source=test&variant=123`, title: 'Same size' })).toBe(variantProductIds[0]!);
    await db.insert(savedProducts).values([
      { userId: ids.a, boutiqueId: ids.boutique, trackedProductId: productId, url: sourceUrl, title: 'Test' },
      { userId: ids.a, boutiqueId: ids.boutique, trackedProductId: productId, url: `${sourceUrl}?utm_source=second`, title: 'Test' },
      { userId: ids.b, boutiqueId: ids.boutique, trackedProductId: productId, url: sourceUrl, title: 'Test' },
    ]);
    const base = Date.now();
    const observe = (priceMinor: number, offset: number, currency = 'TRY', mode: 'market_observation' | 'rebaseline' = 'market_observation', availability: 'in_stock' | 'out_of_stock' | 'unknown' = 'in_stock') => recordPriceObservation({ trackedProductId: productId!, priceMinor, currency, observedAt: new Date(base + offset), mode, availability });
    const events = () => db.select().from(priceDropEvents).where(eq(priceDropEvents.trackedProductId, productId!));
    await observe(10000, 1);
    await observe(10000, 2);
    await observe(12000, 3);
    await db.insert(savedProducts).values({ userId: ids.outsider, boutiqueId: ids.boutique, trackedProductId: productId,
      url: sourceUrl, title: 'New watcher after last stock observation', createdAt: new Date(base + 4), trackingStartedAt: new Date(base + 4) });
    expect(await events()).toHaveLength(0);
    await Promise.all([observe(9000, 4), observe(9000, 4)]);
    expect(await events()).toHaveLength(1);
    expect(await db.select().from(notifications).where(eq(notifications.userId, ids.outsider))).toHaveLength(0);
    await db.delete(savedProducts).where(eq(savedProducts.userId, ids.outsider));
    expect(pushes).toHaveLength(0); // Committed price and queue survive before any worker runs.
    expect(await db.select().from(pushOutbox)).toHaveLength(2);
    await Promise.all([runPushOutboxBatch(), runPushOutboxBatch()]);
    expect(pushes).toHaveLength(2); // One per user despite duplicate saves/concurrent workers.
    await observe(8000, 2); // stale observation
    await observe(7000, 5, 'TRY', 'rebaseline');
    await observe(6000, 6, 'USD');
    expect(await events()).toHaveLength(1);
    expect(pushes).toHaveLength(2);
    await expect(observe(0, 7)).rejects.toThrow();
    await expect(observe(12.5, 7)).rejects.toThrow();
    await expect(observe(5000, 7, 'invalid')).rejects.toThrow();
    await observe(5000, 8, 'USD');
    await runPushOutboxBatch();
    expect(await events()).toHaveLength(2);
    expect(pushes).toHaveLength(4);
    // A new client's save must not rewrite an existing verified price either.
    await ensureTrackedProduct({ boutiqueId: ids.boutique, url: sourceUrl, title: 'Test ürün', priceMinor: 1, currency: 'TRY' });
    expect(await events()).toHaveLength(2);
    const [verified] = await db.select().from(trackedProducts).where(eq(trackedProducts.id, productId!));
    expect(verified!.currentPriceMinor).toBe(5000);

    const tokens = { a: await signAccessToken(ids.a), b: await signAccessToken(ids.b), outsider: await signAccessToken(ids.outsider) };
    const request = (path: string, user: keyof typeof tokens = 'a', method = 'GET') => app.request(`/notifications${path}`, { method, headers: { Authorization: `Bearer ${tokens[user]}` } });
    const page = async (response: Response | Promise<Response>) => (await response).json() as Promise<NotificationPage>;
    const unread = async (user: keyof typeof tokens = 'a') => (await request('/unread-count', user)).json() as Promise<{ count: number }>;
    const read = async (id: string) => (await request(`/${id}/read`, 'a', 'PATCH')).json() as Promise<{ readAt: string }>;
    expect((await app.request('/notifications')).status).toBe(401);
    expect((await request('?limit=0')).status).toBe(400);
    expect((await request('?cursor=invalid')).status).toBe(400);
    const first = await page(request('?limit=1'));
    expect(first.items).toHaveLength(1);
    expect(first.items[0]!.previousPriceMinor).toBe(6000);
    expect(first.items[0]!.newPriceMinor).toBe(5000);
    expect(first.items[0]!.readAt).toBeNull();
    const second = await page(request(`?limit=1&cursor=${first.nextCursor}`));
    expect(second.items).toHaveLength(1);
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
    expect(second.nextCursor).toBeNull();
    expect((await page(request('', 'outsider'))).items).toHaveLength(0);
    expect((await page(request(`?cursor=${first.nextCursor}`, 'outsider'))).items).toHaveLength(0);
    expect((await request(`/${first.items[0]!.id}/read`, 'b', 'PATCH')).status).toBe(404);
    expect((await request('/not-a-uuid/read', 'a', 'PATCH')).status).toBe(400);
    const read1 = await read(first.items[0]!.id);
    const read2 = await read(first.items[0]!.id);
    expect(read1.readAt).not.toBeNull();
    expect(read2.readAt).toBe(read1.readAt);
    expect((await unread()).count).toBe(1);
    expect((await unread('b')).count).toBe(2);
    expect((await request(`/events/${second.items[0]!.eventId}/read`, 'a', 'PATCH')).status).toBe(200);
    expect((await unread()).count).toBe(0);

    // Unsave stops future notifications, historical inbox entries remain.
    await db.delete(savedProducts).where(eq(savedProducts.userId, ids.b));
    await observe(4000, 9, 'USD');
    await runPushOutboxBatch();
    expect(pushes).toHaveLength(5);
    expect((await page(request('', 'b'))).items).toHaveLength(2);
    await db.delete(savedProducts).where(eq(savedProducts.userId, ids.a));
    await observe(3000, 10, 'USD');
    await runPushOutboxBatch();
    expect(pushes).toHaveLength(5);

    // Stock uncertainty cannot create an inbox event or corrupt the available baseline.
    await db.insert(savedProducts).values({ userId: ids.a, boutiqueId: ids.boutique, trackedProductId: productId, url: sourceUrl, title: 'Test', createdAt: new Date(base + 10), trackingStartedAt: new Date(base + 10) });
    const beforeStock = (await events()).length;
    await observe(2700, 11, 'USD', 'market_observation', 'unknown');
    await observe(2300, 12, 'USD', 'market_observation', 'out_of_stock');
    expect(await events()).toHaveLength(beforeStock);
    await observe(2300, 13, 'USD'); // Same visible price, newly in stock, compare against last available 3000.
    expect(await events()).toHaveLength(beforeStock + 1);
    const [stockEvent] = (await events()).filter(e => e.newPriceMinor === 2300);
    expect(stockEvent!.previousPriceMinor).toBe(3000);

    const pending = async () => {
      const rows = await db.select().from(pushOutbox).where(eq(pushOutbox.status, 'pending'));
      expect(rows).toHaveLength(1);
      return rows[0]!;
    };
    const row = async (id: string) => (await db.select().from(pushOutbox).where(eq(pushOutbox.id, id)))[0]!;
    const due = (id: string) => db.update(pushOutbox).set({ nextAttemptAt: new Date(0) }).where(eq(pushOutbox.id, id));

    const retryJob = await pending();
    sendStatus = 503;
    await runPushOutboxBatch();
    expect(await row(retryJob.id)).toMatchObject({ status: 'pending', attempts: 1, lastError: 'HTTP_503' });
    const requestsAfterFailure = pushes.length;
    await runPushOutboxBatch();
    expect(pushes).toHaveLength(requestsAfterFailure); // Backoff respected.
    sendStatus = 200;
    await due(retryJob.id);
    await runPushOutboxBatch();
    expect(await row(retryJob.id)).toMatchObject({ status: 'awaiting_receipt', attempts: 2 });
    const sent = pushes.length;
    receipt = 'missing';
    await due(retryJob.id);
    await runPushOutboxBatch();
    expect(await row(retryJob.id)).toMatchObject({ status: 'awaiting_receipt', lastError: 'ReceiptNotReady' });
    expect(pushes).toHaveLength(sent); // Never resend an accepted ticket because its receipt is delayed.
    receipt = 'ok';
    await due(retryJob.id);
    await runPushOutboxBatch();
    expect((await row(retryJob.id)).status).toBe('delivered');

    // A worker crash leaves a lease; another worker recovers it after expiry.
    await observe(2200, 14, 'USD');
    const leased = await pending();
    await db.update(pushOutbox).set({ leaseToken: crypto.randomUUID(), lockedUntil: new Date(Date.now() + 60000) }).where(eq(pushOutbox.id, leased.id));
    await runPushOutboxBatch();
    expect(pushes).toHaveLength(sent);
    await db.update(pushOutbox).set({ lockedUntil: new Date(0) }).where(eq(pushOutbox.id, leased.id));
    await runPushOutboxBatch();
    expect((await row(leased.id)).status).toBe('awaiting_receipt');

    // A receipt for an old token must not disable the replacement token.
    const newToken = `ExponentPushToken[rotated-${ids.a}]`;
    await db.update(pushDevices).set({ expoPushToken: newToken }).where(eq(pushDevices.id, leased.deviceId));
    receipt = 'DeviceNotRegistered';
    await due(leased.id);
    await runPushOutboxBatch();
    expect((await row(leased.id)).status).toBe('failed');
    expect((await db.select().from(pushDevices).where(eq(pushDevices.id, leased.deviceId)))[0]!.enabled).toBe(true);

    // Ownership changes must cancel queued messages to prevent cross-account disclosure.
    await observe(2100, 15, 'USD');
    const reassigned = await pending();
    await db.update(pushDevices).set({ userId: ids.b }).where(eq(pushDevices.id, reassigned.deviceId));
    const beforeCancel = pushes.length;
    await runPushOutboxBatch();
    expect((await row(reassigned.id)).status).toBe('cancelled');
    expect(pushes).toHaveLength(beforeCancel);
    await db.update(pushDevices).set({ userId: ids.a }).where(eq(pushDevices.id, reassigned.deviceId));

    // A newer sold-out observation cancels an unsent discount.
    await observe(2000, 16, 'USD');
    const soldOut = await pending();
    await observe(1900, 17, 'USD', 'market_observation', 'out_of_stock');
    await runPushOutboxBatch();
    expect((await row(soldOut.id)).status).toBe('cancelled');
    expect(pushes).toHaveLength(beforeCancel);

    await observe(1900, 18, 'USD');
    const exhausted = await pending();
    sendStatus = 429;
    for (let i = 0; i < 6; i++) { await due(exhausted.id); await runPushOutboxBatch(); }
    expect(await row(exhausted.id)).toMatchObject({ status: 'failed', attempts: 6, lastError: 'HTTP_429' });
    const afterExhausted = pushes.length;
    await runPushOutboxBatch();
    expect(pushes).toHaveLength(afterExhausted);

    await observe(1800, 19, 'USD');
    const invalid = await pending();
    sendStatus = 400;
    await runPushOutboxBatch();
    expect(await row(invalid.id)).toMatchObject({ status: 'failed', attempts: 1, lastError: 'HTTP_400' });

    // Invalid active token is disabled when the receipt matches the current owner/token.
    await observe(1700, 20, 'USD');
    const unregistered = await pending();
    sendStatus = 200;
    await runPushOutboxBatch();
    await due(unregistered.id);
    await runPushOutboxBatch();
    expect((await row(unregistered.id)).status).toBe('failed');
    expect((await db.select().from(pushDevices).where(eq(pushDevices.id, unregistered.deviceId)))[0]!.enabled).toBe(false);

    await db.update(pushDevices).set({ enabled: true }).where(eq(pushDevices.id, unregistered.deviceId));
    await observe(1600, 21, 'USD');
    const outdated = await pending();
    await observe(1500, 22, 'USD');
    const beforeLatest = pushes.length;
    await runPushOutboxBatch();
    expect((await row(outdated.id)).status).toBe('cancelled');
    expect(pushes).toHaveLength(beforeLatest + 1); // Send only the current price, not superseded queued discounts.

    await observe(1400, 23, 'USD');
    const expired = await pending();
    await db.update(pushOutbox).set({ expiresAt: new Date(0) }).where(eq(pushOutbox.id, expired.id));
    await runPushOutboxBatch();
    expect(await row(expired.id)).toMatchObject({ status: 'failed', lastError: 'Expired' });
    expect(pushes).toHaveLength(beforeLatest + 1);

    await observe(1300, 24, 'USD');
    const unsaved = await pending();
    await db.delete(savedProducts).where(eq(savedProducts.userId, ids.a));
    await runPushOutboxBatch();
    expect((await row(unsaved.id)).status).toBe('cancelled');
    expect(pushes).toHaveLength(beforeLatest + 1);
    // Re-saving or changing back to this size must not revive an older queued discount.
    await db.insert(savedProducts).values({userId:ids.a,boutiqueId:ids.boutique,trackedProductId:productId,url:sourceUrl,title:'Rejoined',trackingStartedAt:new Date(base+23)});
    await observe(1200,25,'USD');
    const rejoined=await pending();
    await db.update(savedProducts).set({trackingStartedAt:new Date(base+26)}).where(eq(savedProducts.userId,ids.a));
    await runPushOutboxBatch();
    expect((await row(rejoined.id)).status).toBe('cancelled');
    expect(pushes).toHaveLength(beforeLatest+1);
  } finally {
    if (variantProductIds.length) await db.delete(trackedProducts).where(inArray(trackedProducts.id, variantProductIds));
    globalThis.fetch = realFetch;
    await db.delete(users).where(inArray(users.id, [ids.a, ids.b, ids.outsider]));
    if (productId) await db.delete(trackedProducts).where(eq(trackedProducts.id, productId));
    await db.delete(boutiques).where(eq(boutiques.id, ids.boutique));
  }
}, 30000);

test.skipIf(!testUrl)('the shared review account keeps in-app notifications but never gets a push', async () => {
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl) throw new Error('Run this integration file separately');
  const { db } = await import('../db');
  const { recordPriceObservation } = await import('./record-price-observation');
  const { runPushOutboxBatch } = await import('../push/push-outbox-worker');
  const { ensureTrackedProduct } = await import('./tracked-product');
  const { eq, inArray } = await import('drizzle-orm');
  const { users, countries, boutiques, trackedProducts, savedProducts, notifications, pushDevices, pushOutbox } = await import('@butika/db');
  const ids = { boutique: crypto.randomUUID(), normal: crypto.randomUUID(), review: crypto.randomUUID() };
  const token = (id: string) => `ExponentPushToken[${id}]`;
  const reviewSwitch = env.REVIEW_AUTH_ENABLED;
  const realFetch = globalThis.fetch;
  const sentTo: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input) !== 'https://exp.host/--/api/v2/push/send') throw new Error('Unexpected network request in test');
    const batch = JSON.parse(String(init?.body)) as Array<{ to: string }>;
    sentTo.push(...batch.map((message) => message.to));
    return Response.json({ data: batch.map(() => ({ status: 'ok', id: crypto.randomUUID() })) });
  }) as typeof fetch;
  let productId: string | null = null;
  try {
    await db.insert(countries).values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' }).onConflictDoNothing();
    await db.insert(boutiques).values({ id: ids.boutique, countryCode: 'TR', name: 'Review push test', url: 'https://review-push.example', coverImageUrl: '' });
    await db.delete(users).where(eq(users.email, env.REVIEW_AUTH_EMAIL));
    await db.insert(users).values([
      { id: ids.normal, displayName: 'Normal watcher' },
      { id: ids.review, email: env.REVIEW_AUTH_EMAIL, displayName: 'App Review' },
    ]);
    for (const id of [ids.normal, ids.review]) {
      await db.insert(pushDevices).values({ userId: id, installationId: crypto.randomUUID(), expoPushToken: token(id), platform: 'android' });
    }
    const sourceUrl = `https://review-push.example/products/${crypto.randomUUID()}`;
    productId = await ensureTrackedProduct({ boutiqueId: ids.boutique, url: sourceUrl, title: 'Review push', priceMinor: 999999, currency: 'TRY' });
    expect(productId).not.toBeNull();
    const base = Date.now();
    await db.insert(savedProducts).values([ids.normal, ids.review].map((userId) => ({ userId, boutiqueId: ids.boutique,
      trackedProductId: productId, url: sourceUrl, title: 'Elbise', trackingStartedAt: new Date(base) })));
    const observe = (priceMinor: number, offset: number, availability: 'in_stock' | 'out_of_stock' = 'in_stock') =>
      recordPriceObservation({ trackedProductId: productId!, priceMinor, currency: 'TRY', observedAt: new Date(base + offset), availability });
    const jobsOf = async (userId: string) => db.select({ status: pushOutbox.status, lastError: pushOutbox.lastError })
      .from(pushOutbox).innerJoin(pushDevices, eq(pushDevices.id, pushOutbox.deviceId)).where(eq(pushDevices.userId, userId));
    const kinds = async (userId: string) => (await db.select({ type: notifications.type }).from(notifications)
      .where(eq(notifications.userId, userId))).map((row) => row.type).sort();

    await observe(10000, 1); // verified in-stock baseline
    // Queued and sent while the review sign-in is on.
    env.REVIEW_AUTH_ENABLED = true;
    await observe(9000, 2);
    await runPushOutboxBatch();
    expect(sentTo).toEqual([token(ids.normal)]);
    // Queued while it is on, sent after it is switched off.
    await observe(8000, 3);
    env.REVIEW_AUTH_ENABLED = false;
    await runPushOutboxBatch();
    expect(sentTo).toEqual([token(ids.normal), token(ids.normal)]);
    // A confirmed back-in-stock alert still reaches the review account's inbox only.
    await db.update(savedProducts).set({ restockAlertAt: new Date(base + 3) }).where(eq(savedProducts.trackedProductId, productId!));
    await observe(8000, 4, 'out_of_stock');
    await observe(8000, 5);
    await runPushOutboxBatch();
    expect(sentTo).toEqual([token(ids.normal), token(ids.normal), token(ids.normal)]);

    expect(await kinds(ids.review)).toEqual(['back_in_stock', 'price_drop', 'price_drop']);
    expect(await kinds(ids.normal)).toEqual(['back_in_stock', 'price_drop', 'price_drop']);
    const reviewJobs = await jobsOf(ids.review);
    expect(reviewJobs).toHaveLength(3);
    expect(reviewJobs.every((job) => job.status === 'cancelled' && job.lastError === 'NoLongerEligible')).toBe(true);
    expect((await jobsOf(ids.normal)).map((job) => job.status)).toEqual(['awaiting_receipt', 'awaiting_receipt', 'awaiting_receipt']);
  } finally {
    globalThis.fetch = realFetch;
    env.REVIEW_AUTH_ENABLED = reviewSwitch;
    await db.delete(users).where(inArray(users.id, [ids.normal, ids.review]));
    if (productId) await db.delete(trackedProducts).where(eq(trackedProducts.id, productId));
    await db.delete(boutiques).where(eq(boutiques.id, ids.boutique));
  }
}, 30000);
