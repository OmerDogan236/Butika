import { expect, test } from 'bun:test';

// Run separately against a disposable, migrated local database (see
// docs/notification-testing.md). Release safety rules: off-site links are saved
// but never tracked, every watcher only sees their own saved title and link,
// a deleted account gets no further notifications, pushes or requests, and the
// shared review account's sessions end when REVIEW_AUTH_ENABLED is off.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('off-site saves, per-user titles and deleted accounts', async () => {
  const url = new URL(testUrl!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/butika_notification_test')) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl) throw new Error('Run this integration file separately');
  const { db } = await import('../db');
  const { users, countries, boutiques, savedProducts, trackedProducts, notifications, pushDevices, pushOutbox } = await import('@butika/db');
  const { eq, inArray } = await import('drizzle-orm');
  const { Hono } = await import('hono');
  const { savedRoutes } = await import('../../routes/saved');
  const { notificationRoutes } = await import('../../routes/notifications');
  const { meRoutes } = await import('../../routes/me');
  const { pushRoutes } = await import('../../routes/push');
  const { authRoutes } = await import('../../routes/auth');
  const { signAccessToken, signRefreshToken } = await import('../jwt');
  const { errorResponse } = await import('../errors');
  const { recordPriceObservation } = await import('./record-price-observation');
  const { runPushOutboxBatch } = await import('../push/push-outbox-worker');
  const app = new Hono().route('/saved', savedRoutes).route('/notifications', notificationRoutes).route('/me', meRoutes)
    .route('/push', pushRoutes).route('/auth', authRoutes);
  app.onError((error, c) => errorResponse(c, error));
  const reviewSwitch = env.REVIEW_AUTH_ENABLED;
  let reviewUserId: string | null = null;

  const ids = { boutique: crypto.randomUUID(), a: crypto.randomUUID(), b: crypto.randomUUID() };
  const host = `shop-${ids.boutique.slice(0, 8)}.example`;
  const productUrl = `https://${host}/products/${crypto.randomUUID()}`;
  const realFetch = globalThis.fetch;
  const sentTo: string[] = [];
  try {
    await db.insert(countries).values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' }).onConflictDoNothing();
    await db.insert(boutiques).values({ id: ids.boutique, countryCode: 'TR', name: 'Release safety', url: `https://www.${host}`, coverImageUrl: '' });
    await db.insert(users).values([ids.a, ids.b].map((id) => ({ id, displayName: 'Release safety' })));
    const tokens = { a: await signAccessToken(ids.a), b: await signAccessToken(ids.b) };
    const call = (path: string, user: 'a' | 'b', init: RequestInit = {}) => app.request(path, { ...init,
      headers: { authorization: `Bearer ${tokens[user]}`, 'content-type': 'application/json' } });
    const save = (user: 'a' | 'b', target: string, title: string) =>
      call('/saved', user, { method: 'POST', body: JSON.stringify({ boutiqueId: ids.boutique, url: target, title }) });

    // 1. Off-site and unsafe links stay plain saves: never tracked, shown as unsupported.
    const offsite = `https://elsewhere.example/p/${crypto.randomUUID()}`;
    for (const target of [offsite, 'http://169.254.169.254/latest/meta-data', `https://${host}:8443/p`, 'http://localhost/p']) {
      expect((await save('a', target, 'Not trackable')).status).toBe(201);
    }
    expect(await db.select().from(trackedProducts).where(eq(trackedProducts.boutiqueId, ids.boutique))).toHaveLength(0);
    const listed = await (await call('/saved', 'a')).json() as Array<{ url: string; tracking: { status: string } }>;
    expect(listed).toHaveLength(4);
    expect(listed.every((saved) => saved.tracking.status === 'unsupported')).toBe(true);

    // 2. One product, two client-supplied titles: the shared row keeps the first
    //    title and each watcher is addressed with their own title and link.
    expect((await save('a', productUrl, 'A başlığı')).status).toBe(201);
    expect((await save('b', `${productUrl}?utm_source=x`, 'B <b>başlığı</b>')).status).toBe(201);
    const [product] = await db.select().from(trackedProducts).where(eq(trackedProducts.boutiqueId, ids.boutique));
    expect(product!.title).toBe('A başlığı');
    for (const id of [ids.a, ids.b]) {
      await db.insert(pushDevices).values({ userId: id, installationId: crypto.randomUUID(), expoPushToken: `ExponentPushToken[${id}]`, platform: 'ios' });
    }
    const start = Date.now();
    const observe = (priceMinor: number, offset: number) => recordPriceObservation({ trackedProductId: product!.id,
      priceMinor, currency: 'TRY', availability: 'in_stock', observedAt: new Date(start + offset) });
    await observe(10000, 1000); // verified in-stock baseline
    await observe(8000, 2000); // drop
    const queued = await db.select({ userId: pushDevices.userId, id: pushOutbox.id, message: pushOutbox.message })
      .from(pushOutbox).innerJoin(pushDevices, eq(pushDevices.id, pushOutbox.deviceId))
      .where(inArray(pushDevices.userId, [ids.a, ids.b]));
    type Message = { body: string; data: { productTitle: string; sourceUrl: string } };
    const byUser = new Map(queued.map((row) => [row.userId, row]));
    expect((byUser.get(ids.a)!.message as Message).body).toContain('A başlığı');
    expect((byUser.get(ids.a)!.message as Message).body).not.toContain('B <b>');
    expect((byUser.get(ids.b)!.message as Message).data).toMatchObject({ productTitle: 'B <b>başlığı</b>', sourceUrl: `${productUrl}?utm_source=x` });
    const inbox = async (user: 'a' | 'b') =>
      (await (await call('/notifications', user)).json() as { items: Array<{ productTitle: string | null; sourceUrl: string }> }).items;
    expect((await inbox('a'))[0]).toMatchObject({ productTitle: 'A başlığı', sourceUrl: productUrl });
    expect((await inbox('b'))[0]).toMatchObject({ productTitle: 'B <b>başlığı</b>', sourceUrl: `${productUrl}?utm_source=x` });

    // 3. Account deletion disables devices at once. Even if a device were enabled
    //    again, the queued push is cancelled and no new notification is created.
    expect((await call('/me', 'b', { method: 'DELETE' })).status).toBe(200);
    expect((await db.select().from(pushDevices).where(eq(pushDevices.userId, ids.b)))[0]!.enabled).toBe(false);
    await db.update(pushDevices).set({ enabled: true }).where(eq(pushDevices.userId, ids.b));
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(input) !== 'https://exp.host/--/api/v2/push/send') throw new Error('Unexpected network request in test');
      const batch = JSON.parse(String(init?.body)) as Array<{ to: string }>;
      sentTo.push(...batch.map((message) => message.to));
      return Response.json({ data: batch.map(() => ({ status: 'ok', id: crypto.randomUUID() })) });
    }) as typeof fetch;
    await runPushOutboxBatch();
    expect(sentTo).toEqual([`ExponentPushToken[${ids.a}]`]);
    expect((await db.select().from(pushOutbox).where(eq(pushOutbox.id, byUser.get(ids.b)!.id)))[0])
      .toMatchObject({ status: 'cancelled', lastError: 'NoLongerEligible' });
    await observe(7000, 3000);
    const notified = await db.select().from(notifications).where(inArray(notifications.userId, [ids.a, ids.b]));
    expect(notified.filter((row) => row.userId === ids.a)).toHaveLength(2);
    expect(notified.filter((row) => row.userId === ids.b)).toHaveLength(1);

    // 4. B's access and refresh tokens are still unexpired: every authenticated
    //    route refuses them, so a deleted account cannot enable a device again.
    const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
    const device = (id: string) => json({ installationId: crypto.randomUUID(), expoPushToken: `ExponentPushToken[device-${id}]`, platform: 'ios' });
    const refresh = async (refreshToken: string) => (await app.request('/auth/refresh', { ...json({ refreshToken }),
      headers: { 'content-type': 'application/json' } })).status;
    for (const path of ['/me', '/saved', '/notifications']) expect((await call(path, 'b')).status).toBe(401);
    expect((await call('/push/devices', 'b', device(ids.b))).status).toBe(401);
    expect(await db.select().from(pushDevices).where(eq(pushDevices.userId, ids.b))).toHaveLength(1);
    expect(await refresh(await signRefreshToken(ids.b))).toBe(401);

    // 5. The shared review account works only while REVIEW_AUTH_ENABLED is on.
    //    Switching it off ends existing sessions, not just new sign-ins.
    env.REVIEW_AUTH_ENABLED = true;
    await db.delete(users).where(eq(users.email, env.REVIEW_AUTH_EMAIL));
    const signIn = await app.request('/auth/review', { ...json({}), headers: { 'content-type': 'application/json' } });
    expect(signIn.status).toBe(200);
    const review = await signIn.json() as { accessToken: string; refreshToken: string; user: { id: string } };
    reviewUserId = review.user.id;
    const asReview = (path: string, init: RequestInit = {}) => app.request(path, { ...init,
      headers: { authorization: `Bearer ${review.accessToken}`, 'content-type': 'application/json' } });
    expect((await asReview('/me')).status).toBe(200);
    expect((await asReview('/push/devices', device(review.user.id))).status).toBe(200);
    expect(await refresh(review.refreshToken)).toBe(200);
    env.REVIEW_AUTH_ENABLED = false;
    expect((await app.request('/auth/review', { ...json({}), headers: { 'content-type': 'application/json' } })).status).toBe(403);
    for (const path of ['/me', '/saved', '/notifications']) expect((await asReview(path)).status).toBe(401);
    expect((await asReview('/push/devices', device(`${review.user.id}-2`))).status).toBe(401);
    expect(await db.select().from(pushDevices).where(eq(pushDevices.userId, review.user.id))).toHaveLength(1);
    expect(await refresh(review.refreshToken)).toBe(401);
    // Other accounts are unaffected by the switch.
    expect((await call('/me', 'a')).status).toBe(200);
    expect(await refresh(await signRefreshToken(ids.a))).toBe(200);
  } finally {
    globalThis.fetch = realFetch;
    env.REVIEW_AUTH_ENABLED = reviewSwitch;
    if (reviewUserId) await db.delete(users).where(eq(users.id, reviewUserId));
    await db.delete(users).where(inArray(users.id, [ids.a, ids.b]));
    await db.delete(trackedProducts).where(eq(trackedProducts.boutiqueId, ids.boutique));
    await db.delete(boutiques).where(eq(boutiques.id, ids.boutique));
  }
}, 30000);
