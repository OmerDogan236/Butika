import { expect, test } from 'bun:test';
import type { NotificationPage } from '@butika/types';

// "Stok gelince haber ver": arming rules, one notification per saved size, no
// second push for the same observation, lapse/one-shot and reset on a size change.
// Run this file separately against a disposable, migrated local database
// (docs/bildirim-sistemi.md, "Test"). Never use the development or production database.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('restock alerts per saved size', async () => {
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
  const { savedRoutes } = await import('../../routes/saved');
  const { notificationRoutes } = await import('../../routes/notifications');
  const { signAccessToken } = await import('../jwt');
  const { errorResponse } = await import('../errors');
  const { Hono } = await import('hono');
  const { and, eq, inArray, isNotNull } = await import('drizzle-orm');
  const { users, countries, boutiques, trackedProducts, savedProducts, notifications, pushDevices, pushOutbox } = await import('@butika/db');
  const app = new Hono().route('/saved', savedRoutes).route('/notifications', notificationRoutes);
  app.onError((err, c) => errorResponse(c, err));
  const ids = { boutique: crypto.randomUUID(), a: crypto.randomUUID(), b: crypto.randomUUID(), c: crypto.randomUUID(), d: crypto.randomUUID() };
  const realFetch = globalThis.fetch;
  const pushes: Array<{ to: string; title: string; body: string; data: { type: string; eventId: string } }> = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input) !== 'https://exp.host/--/api/v2/push/send') throw new Error('Unexpected network request in test');
    const batch = JSON.parse(String(init?.body));
    pushes.push(...batch);
    return Response.json({ data: batch.map(() => ({ status: 'ok', id: crypto.randomUUID() })) });
  }) as typeof fetch;
  // Observations and saves must be newer than the arming time, which uses the real clock.
  let clock = Date.now();
  const tick = () => new Date(clock = Math.max(clock + 1000, Date.now()));
  try {
    await db.insert(countries).values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' }).onConflictDoNothing();
    await db.insert(boutiques).values({ id: ids.boutique, countryCode: 'TR', name: 'Stok Test Butiği', url: 'https://example.com', coverImageUrl: '' });
    await db.insert(users).values([ids.a, ids.b, ids.c, ids.d].map((id) => ({ id, displayName: 'Restock test' })));
    for (const userId of [ids.a, ids.b, ids.c, ids.d]) {
      await db.insert(pushDevices).values({ userId, installationId: crypto.randomUUID(), expoPushToken: `ExponentPushToken[${userId}]`, platform: 'android' });
    }
    const page = `https://example.com/products/${crypto.randomUUID()}`;
    const track = async (variant: string) => (await ensureTrackedProduct({ boutiqueId: ids.boutique, url: `${page}?variant=${variant}`, title: `Beden ${variant}` }))!;
    const save = async (userId: string, trackedProductId: string | null, link: string, title: string) => {
      const [row] = await db.insert(savedProducts).values({ userId, boutiqueId: ids.boutique, trackedProductId, url: link, title,
        trackingStartedAt: tick() }).returning({ id: savedProducts.id });
      return row!.id;
    };
    const observe = (trackedProductId: string, priceMinor: number, availability: 'in_stock' | 'out_of_stock' | 'unknown') =>
      recordPriceObservation({ trackedProductId, priceMinor, currency: 'TRY', availability, observedAt: tick() });
    const tokens = { a: await signAccessToken(ids.a), b: await signAccessToken(ids.b), c: await signAccessToken(ids.c), d: await signAccessToken(ids.d) };
    type User = keyof typeof tokens;
    const call = (path: string, user: User, method = 'GET', body?: unknown) => app.request(path, { method,
      headers: { Authorization: `Bearer ${tokens[user]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const arm = (user: User, savedId: string) => call(`/saved/${savedId}/restock-alert`, user, 'PUT');
    const armed = async (user: User, savedId: string) => {
      const response = await arm(user, savedId);
      const body = await response.json() as { restockAlert?: string };
      if (!body.restockAlert) throw new Error(`arming failed: ${response.status} ${JSON.stringify(body)}`);
      return body.restockAlert;
    };
    const refused = async (user: User, savedId: string) => {
      const response = await arm(user, savedId);
      return `${response.status} ${(await response.json() as { error: { code: string } }).error.code}`;
    };
    const alertOf = async (user: User, savedId: string) => {
      const list = await (await call('/saved', user)).json() as Array<{ id: string; restockAlert: string }>;
      return list.find((item) => item.id === savedId)!.restockAlert;
    };
    const kinds = async (userId: string) => (await db.select({ type: notifications.type }).from(notifications)
      .where(eq(notifications.userId, userId))).map((row) => row.type).sort();
    const inbox = async (user: User) => (await (await call('/notifications', user)).json() as NotificationPage).items;

    const m = await track('101');
    const saves = {
      a: await save(ids.a, m, `${page}?variant=101`, 'Elbise · Beden: M'),
      b: await save(ids.b, m, `${page}?variant=101`, 'Elbise M'),
      c: await save(ids.c, m, `${page}?variant=101`, 'Elbise'),
      d: await save(ids.d, m, `${page}?variant=101`, 'Elbise (yalnız fiyat)'),
    };

    // Before the first check an alert waits for the server to see the size sold out,
    // and the check is brought forward.
    expect(await armed('a', saves.a)).toBe('pending');
    const [queued] = await db.select().from(trackedProducts).where(eq(trackedProducts.id, m));
    expect(queued!.nextCheckAt.getTime()).toBeLessThanOrEqual(Date.now() + 6 * 60 * 60 * 1000);
    // Available at the first check: the unconfirmed alert lapses without a notification.
    await observe(m, 10000, 'in_stock');
    expect(await alertOf('a', saves.a)).toBe('off');
    expect(await kinds(ids.a)).toEqual([]);
    expect(await refused('a', saves.a)).toBe('409 already_in_stock');

    // Sold out: alerts arm at once; arming is idempotent and per owner.
    await observe(m, 10000, 'out_of_stock');
    for (const user of ['a', 'b', 'c'] as const) expect(await armed(user, saves[user])).toBe('armed');
    expect(await armed('a', saves.a)).toBe('armed');
    expect((await arm('b', saves.a)).status).toBe(404);
    expect((await call('/saved/not-a-uuid/restock-alert', 'a', 'PUT')).status).toBe(400);
    expect(await (await call(`/saved/${saves.b}/restock-alert`, 'b', 'DELETE')).json()).toEqual({ restockAlert: 'off' });
    expect(await armed('b', saves.b)).toBe('armed');
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, ids.c));

    // Back in stock and cheaper: A and B get one back_in_stock each and no second
    // push for the drop; D, who did not ask, gets the price drop; deleted C nothing.
    await observe(m, 9000, 'in_stock');
    expect(await kinds(ids.a)).toEqual(['back_in_stock']);
    expect(await kinds(ids.b)).toEqual(['back_in_stock']);
    expect(await kinds(ids.c)).toEqual([]);
    expect(await kinds(ids.d)).toEqual(['price_drop']);
    expect(await db.select().from(savedProducts).where(and(inArray(savedProducts.id, [saves.a, saves.b, saves.c]),
      isNotNull(savedProducts.restockAlertAt)))).toHaveLength(0);
    await runPushOutboxBatch();
    expect(pushes.map((push) => push.data.type).sort()).toEqual(['back_in_stock', 'back_in_stock', 'price_drop']);
    const restockPush = pushes.find((push) => push.to === `ExponentPushToken[${ids.a}]`)!;
    expect(restockPush.title).toBe('Stoğa geldi 🎉');
    expect(restockPush.body).toBe('Elbise · Beden: M tekrar stokta: ₺100,00 → ₺90,00');
    const [item] = await inbox('a');
    expect(item).toMatchObject({ type: 'back_in_stock', previousPriceMinor: 10000, newPriceMinor: 9000, currency: 'TRY',
      productTitle: 'Elbise · Beden: M', readAt: null });
    expect((await call(`/notifications/events/${item!.eventId}/read`, 'd', 'PATCH')).status).toBe(404);
    expect((await call(`/notifications/events/${item!.eventId}/read`, 'a', 'PATCH')).status).toBe(200);
    expect((await inbox('a'))[0]!.readAt).not.toBeNull();
    expect((await inbox('d'))[0]).toMatchObject({ type: 'price_drop', previousPriceMinor: 10000, newPriceMinor: 9000 });

    // One-shot: selling out and returning again notifies nobody.
    await observe(m, 9000, 'out_of_stock');
    await observe(m, 9000, 'in_stock');
    expect(await kinds(ids.a)).toEqual(['back_in_stock']);

    // A pending alert on an unchecked size is confirmed by a sell-out; uncertain
    // stock neither fires nor cancels it; the return fires it.
    const l = await track('102');
    const savedL = await save(ids.a, l, `${page}?variant=102`, 'Elbise · Beden: L');
    expect(await armed('a', savedL)).toBe('pending');
    await observe(l, 9500, 'out_of_stock');
    expect(await alertOf('a', savedL)).toBe('armed');
    await observe(l, 9500, 'unknown');
    expect(await alertOf('a', savedL)).toBe('armed');
    await observe(l, 9500, 'in_stock');
    expect(await kinds(ids.a)).toEqual(['back_in_stock', 'back_in_stock']);
    // Sold out again before sending: the queued push is cancelled.
    await observe(l, 9500, 'out_of_stock');
    const sent = pushes.length;
    await runPushOutboxBatch();
    expect(pushes).toHaveLength(sent);
    const [lPush] = await db.select().from(pushOutbox).innerJoin(notifications, eq(notifications.id, pushOutbox.notificationId))
      .where(and(eq(notifications.userId, ids.a), eq(pushOutbox.status, 'cancelled')));
    expect(lPush!.push_outbox.lastError).toBe('NoLongerEligible');

    // A store that never reveals stock cannot confirm a sell-out; links outside the
    // boutique's site have no tracking at all.
    const s = await track('103');
    const savedS = await save(ids.a, s, `${page}?variant=103`, 'Elbise · Beden: S');
    await observe(s, 9900, 'unknown');
    expect(await refused('a', savedS)).toBe('409 stock_unknown');
    const offsite = await save(ids.a, null, `https://other.example/${crypto.randomUUID()}`, 'Başka site');
    expect(await refused('a', offsite)).toBe('409 restock_unavailable');

    // Another size is a different alert: changing the saved size switches it off.
    await observe(s, 9900, 'out_of_stock');
    expect(await armed('a', savedS)).toBe('armed');
    const changed = await call(`/saved/${savedS}/variant`, 'a', 'PATCH', { url: `${page}?variant=104`, title: 'Elbise · Beden: XS' });
    expect(changed.status).toBe(200);
    expect(await alertOf('a', savedS)).toBe('off');
  } finally {
    globalThis.fetch = realFetch;
    await db.delete(users).where(inArray(users.id, [ids.a, ids.b, ids.c, ids.d]));
    await db.delete(trackedProducts).where(eq(trackedProducts.boutiqueId, ids.boutique));
    await db.delete(boutiques).where(eq(boutiques.id, ids.boutique));
  }
}, 30000);
