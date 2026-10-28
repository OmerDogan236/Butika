import { expect, test } from 'bun:test';

// A chosen Lutvelizade size through the real save and size-change routes, the real
// price check and the real observation recorder. The store's pages are fixtures
// built on the saved 2026-09-24 page; every later state is made up, and the store
// keeping a size's GUID when it comes back is the assumption under test, not an
// observation. No push leaves the process: this is a local decision-chain proof,
// not evidence about production or a phone delivery. The file removes its own
// account, boutique, tracking, events and queue rows.
// Run this file separately against a disposable, migrated local database
// (docs/bildirim-sistemi.md, "Test"). Never use the development or production database.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('a chosen Lutvelizade size: saved, checked, alerted and changed without a false notification', async () => {
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
  const { and, desc, eq, inArray, or } = await import('drizzle-orm');
  const { users, countries, boutiques, trackedProducts, savedProducts, notifications, pushDevices, pushOutbox,
    restockEvents, priceDropEvents, collections, savedProductCollections } = await import('@butika/db');
  const { LUTVELIZADE_URL, PPV, SIZE, SAVED_SIZES, SAVED_DIALOG, lutvelizadePage, productJsonLd, selectedUrl } = await import('./lutvelizade.fixture');

  const app = new Hono().route('/saved', savedRoutes);
  app.onError((err, c) => errorResponse(c, err));
  const ids = { boutique: crypto.randomUUID(), user: crypto.randomUUID() };
  const NEW_GUID = '0f0e0d0c-0b0a-4908-8706-050403020100';

  // The store's answers, switched per phase. Only the product page may be requested.
  let page = lutvelizadePage();
  const pushes: unknown[] = [];
  const requested: string[] = [];
  const unexpected: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const href = String(input instanceof Request ? input.url : input);
    if (href === 'https://exp.host/--/api/v2/push/send') {
      const batch = JSON.parse(String(init?.body)) as unknown[];
      pushes.push(...batch);
      return Response.json({ data: batch.map(() => ({ status: 'ok', id: crypto.randomUUID() })) });
    }
    if (href === LUTVELIZADE_URL) { requested.push(href); return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } }); }
    unexpected.push(href);
    throw new Error(`Unexpected network request in test: ${href}`);
  }) as typeof fetch;

  const mine: string[] = [];
  try {
    await db.insert(countries).values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' }).onConflictDoNothing();
    await db.insert(boutiques).values({ id: ids.boutique, countryCode: 'TR', name: 'Lutvelizade beden testi', url: 'https://www.lutvelizade.com.tr', coverImageUrl: '' });
    await db.insert(users).values({ id: ids.user, displayName: 'Lutvelizade beden testi' });
    const [device] = await db.insert(pushDevices).values({ userId: ids.user, installationId: crypto.randomUUID(),
      expoPushToken: `ExponentPushToken[${ids.user}]`, platform: 'android' }).returning({ id: pushDevices.id });
    const token = await signAccessToken(ids.user);
    const call = (path: string, method = 'GET', body?: unknown) => app.request(path, { method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const save = async (link: string, title: string) => {
      const response = await call('/saved', 'POST', { boutiqueId: ids.boutique, url: link, title });
      return { status: response.status, body: await response.json() as { id: string } };
    };
    const row = async (savedId: string) => (await db.select({ url: savedProducts.url, tracked: savedProducts.trackedProductId,
      createdAt: savedProducts.createdAt, armed: savedProducts.restockAlertAt, confirmed: savedProducts.restockConfirmedAt })
      .from(savedProducts).where(eq(savedProducts.id, savedId)))[0]!;
    const due = async (id: string, isDue: boolean) => db.update(trackedProducts)
      .set({ nextCheckAt: new Date(Date.now() + (isDue ? -60_000 : 3_600_000)), checkLeaseToken: null, checkLeaseUntil: null })
      .where(eq(trackedProducts.id, id));
    const only = async (id: string) => { for (const other of mine) await due(other, other === id); };
    const state = async (id: string) => (await db.select({ canonicalUrl: trackedProducts.canonicalUrl, price: trackedProducts.currentPriceMinor,
      availability: trackedProducts.availability, error: trackedProducts.lastError, failures: trackedProducts.consecutiveFailures })
      .from(trackedProducts).where(eq(trackedProducts.id, id)))[0]!;
    // Every notification is bound to its size through its own event, a restock or a
    // price drop, never through the account alone: the account watches several
    // sizes. Distinct notification and outbox ids, so a join never counts twice.
    const counted = async (trackedProductId: string) => {
      const rows = await db.select({ id: notifications.id, type: notifications.type, outboxId: pushOutbox.id, deviceId: pushOutbox.deviceId })
        .from(notifications)
        .leftJoin(restockEvents, eq(restockEvents.id, notifications.restockEventId))
        .leftJoin(priceDropEvents, eq(priceDropEvents.id, notifications.priceDropEventId))
        .leftJoin(pushOutbox, eq(pushOutbox.notificationId, notifications.id))
        .where(and(eq(notifications.userId, ids.user),
          or(eq(restockEvents.trackedProductId, trackedProductId), eq(priceDropEvents.trackedProductId, trackedProductId))));
      return { notifications: new Set(rows.map(r => r.id)).size, outbox: new Set(rows.map(r => r.outboxId).filter(Boolean)).size,
        types: [...new Set(rows.map(r => r.type))].sort(), devices: [...new Set(rows.map(r => r.deviceId).filter(Boolean))] };
    };
    const events = async (trackedProductId: string) => ({
      drops: (await db.select({ id: priceDropEvents.id }).from(priceDropEvents).where(eq(priceDropEvents.trackedProductId, trackedProductId))).length,
      restocks: (await db.select({ id: restockEvents.id }).from(restockEvents).where(eq(restockEvents.trackedProductId, trackedProductId))).length,
    });
    // The account's rows counted without any product: each must belong to exactly
    // one of this scenario's sizes, so the per-size counts add up to these.
    const totals = async () => ({
      notifications: (await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.userId, ids.user))).length,
      outbox: (await db.select({ id: pushOutbox.id }).from(pushOutbox).innerJoin(notifications, eq(notifications.id, pushOutbox.notificationId))
        .where(eq(notifications.userId, ids.user))).length,
    });
    const none = { notifications: 0, outbox: 0, types: [], devices: [] };

    // ── 1. The route keeps the chosen size in the address, one tracking per size.
    const sold = await save(selectedUrl(SIZE[36]), 'Asimetrik Kesim Siyah Kadın Terlik · 36');
    const open = await save(selectedUrl(SIZE[38]), 'Asimetrik Kesim Siyah Kadın Terlik · 38');
    expect([sold.status, open.status]).toEqual([201, 201]);
    const soldTracked = (await row(sold.body.id)).tracked!, openTracked = (await row(open.body.id)).tracked!;
    mine.push(soldTracked, openTracked);
    expect(soldTracked).not.toBe(openTracked);
    expect((await row(sold.body.id)).url).toBe(selectedUrl(SIZE[36]));
    expect(new URL((await state(soldTracked)).canonicalUrl).searchParams.getAll('_butika_variant')).toEqual([`lutvelizade:${PPV}:${SIZE[36]}`]);

    // ── 2. The saved page: 36 sold out, 38 in stock, both at the product price.
    await only(soldTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    await only(openTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(soldTracked)).toMatchObject({ price: 59996, availability: 'out_of_stock' });
    expect(await state(openTracked)).toMatchObject({ price: 59996, availability: 'in_stock' });
    expect(requested).toEqual([LUTVELIZADE_URL, LUTVELIZADE_URL]);

    // "Stok gelince haber ver" on the sold-out size arms at once.
    const armResponse = await call(`/saved/${sold.body.id}/restock-alert`, 'PUT');
    expect(armResponse.status).toBe(200);
    expect(await armResponse.json()).toMatchObject({ restockAlert: 'armed' });
    expect((await (await call(`/saved/${open.body.id}/restock-alert`, 'PUT')).json() as { error: { code: string } }).error.code).toBe('already_in_stock');
    const armed = await row(sold.body.id);

    // ── 3. Synthetic: 36 back under a new GUID. The saved GUID is gone: the reader
    // returns not_found and the check fails. The stored availability stays the last
    // verified one, out_of_stock: nothing is written as unknown and no new stock is
    // taken. The alarm stands and the failed check produces no event or notification.
    page = lutvelizadePage({ sizes: SAVED_SIZES.map(s => s.label === '36' ? { label: '36', id: NEW_GUID } : s),
      dialog: SAVED_DIALOG.filter(s => s.label !== '36') });
    await only(soldTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, failed: 1 });
    expect((await state(soldTracked)).error).toBe('not_found: Selected Lutvelizade size cannot be verified: size not on page');
    expect(await state(soldTracked)).toMatchObject({ price: 59996, availability: 'out_of_stock', failures: 1 });
    expect(await row(sold.body.id)).toMatchObject({ armed: armed.armed, confirmed: armed.confirmed });
    expect(await events(soldTracked)).toEqual({ drops: 0, restocks: 0 });
    expect(await counted(soldTracked)).toEqual(none);

    // ── 4. Synthetic: the page states 36 both ways. No stock either way.
    page = lutvelizadePage({ sizes: SAVED_SIZES.map(s => s.label === '36' ? { label: '36', id: SIZE[36] } : s) });
    await only(soldTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, failed: 1 });
    expect((await state(soldTracked)).error).toBe('not_found: Selected Lutvelizade size cannot be verified: size lists');
    expect(await state(soldTracked)).toMatchObject({ price: 59996, availability: 'out_of_stock', failures: 2 });
    expect(await row(sold.body.id)).toMatchObject({ armed: armed.armed, confirmed: armed.confirmed });
    expect(await events(soldTracked)).toEqual({ drops: 0, restocks: 0 });
    expect(await counted(soldTracked)).toEqual(none);

    // ── 5. Synthetic: 36 back under the same GUID. One back-in-stock, once.
    const back36 = { sizes: SAVED_SIZES.map(s => s.label === '36' ? { label: '36', id: SIZE[36] } : s), dialog: SAVED_DIALOG.filter(s => s.label !== '36') };
    page = lutvelizadePage(back36);
    await only(soldTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(soldTracked)).toMatchObject({ price: 59996, availability: 'in_stock' });
    expect(await events(soldTracked)).toEqual({ drops: 0, restocks: 1 });
    expect(await counted(soldTracked)).toEqual({ notifications: 1, outbox: 1, types: ['back_in_stock'], devices: [device!.id] });
    expect((await row(sold.body.id)).armed).toBeNull();
    await only(soldTracked);
    await runPriceTrackingBatch();
    expect(await counted(soldTracked)).toEqual({ notifications: 1, outbox: 1, types: ['back_in_stock'], devices: [device!.id] });
    // The size that never sold out has nothing of its own.
    expect(await counted(openTracked)).toEqual(none);

    // ── 6. Synthetic: the product gets cheaper while 38 stays in stock. The page
    // lowers its displayed price and its JSON-LD offer together, so the product's own
    // reading moves with them. One price drop, one notification, one job for this
    // device; the same observation again adds nothing; 36 is not touched.
    const priced = (shown: string, amount: number, sizes: Parameters<typeof lutvelizadePage>[0] = back36) => lutvelizadePage({ ...sizes,
      prices: `<span class="price invalid">1499,90 TL</span><span class="price discounted">${shown} TL</span>`,
      jsonLd: productJsonLd({}, { price: amount }) });
    const untouched36 = async () => ({ state: await state(soldTracked), counted: await counted(soldTracked), events: await events(soldTracked) });
    const before36 = await untouched36();
    page = priced('499,96', 499.96);
    await only(openTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(openTracked)).toMatchObject({ price: 49996, availability: 'in_stock' });
    expect(await events(openTracked)).toEqual({ drops: 1, restocks: 0 });
    // The narrow counter check: a notification bound only to a price drop is counted
    // for its own size, and not for the other size.
    expect(await counted(openTracked)).toEqual({ notifications: 1, outbox: 1, types: ['price_drop'], devices: [device!.id] });
    expect(await untouched36()).toEqual(before36);
    await only(openTracked);
    await runPriceTrackingBatch();
    expect(await events(openTracked)).toEqual({ drops: 1, restocks: 0 });
    expect(await counted(openTracked)).toEqual({ notifications: 1, outbox: 1, types: ['price_drop'], devices: [device!.id] });
    expect(await totals()).toEqual({ notifications: 2, outbox: 2 });

    // ── 7. Synthetic: 38 sells out, its alert is armed, and it comes back cheaper in
    // one observation. Both events are recorded, but the owner of the alert gets
    // back_in_stock only, with one job: the existing priority, unchanged.
    const sold38 = { sizes: back36.sizes.map(s => s.label === '38' ? { label: '38', disabled: true } : s),
      dialog: [...back36.dialog, { label: '38', id: SIZE[38] }] };
    page = priced('499,96', 499.96, sold38);
    await only(openTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(openTracked)).toMatchObject({ price: 49996, availability: 'out_of_stock' });
    expect((await (await call(`/saved/${open.body.id}/restock-alert`, 'PUT')).json() as { restockAlert: string }).restockAlert).toBe('armed');
    page = priced('399,96', 399.96);
    await only(openTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(openTracked)).toMatchObject({ price: 39996, availability: 'in_stock' });
    expect(await events(openTracked)).toEqual({ drops: 2, restocks: 1 });
    expect(await counted(openTracked)).toEqual({ notifications: 2, outbox: 2, types: ['back_in_stock', 'price_drop'], devices: [device!.id] });
    const [latestDrop] = await db.select({ id: priceDropEvents.id, from: priceDropEvents.previousPriceMinor, to: priceDropEvents.newPriceMinor })
      .from(priceDropEvents).where(eq(priceDropEvents.trackedProductId, openTracked)).orderBy(desc(priceDropEvents.detectedAt)).limit(1);
    expect(latestDrop).toMatchObject({ from: 49996, to: 39996 });
    expect(await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.priceDropEventId, latestDrop!.id))).toHaveLength(0);
    expect((await row(open.body.id)).armed).toBeNull();
    await only(openTracked);
    await runPriceTrackingBatch();
    expect(await events(openTracked)).toEqual({ drops: 2, restocks: 1 });
    expect(await counted(openTracked)).toEqual({ notifications: 2, outbox: 2, types: ['back_in_stock', 'price_drop'], devices: [device!.id] });
    expect(await untouched36()).toEqual(before36);
    expect(await totals()).toEqual({ notifications: 3, outbox: 3 });

    // ── 8. Changing the saved size keeps the save, its collections and its date,
    // and starts the new size without the old size's alert.
    const [collection] = await db.insert(collections).values({ userId: ids.user, name: 'Terlikler' }).returning({ id: collections.id });
    expect((await call(`/saved/${sold.body.id}/collections`, 'POST', { collectionIds: [collection!.id] })).status).toBe(200);
    page = lutvelizadePage();
    await only(soldTracked);
    await runPriceTrackingBatch();
    expect((await (await call(`/saved/${sold.body.id}/restock-alert`, 'PUT')).json() as { restockAlert: string }).restockAlert).toBe('armed');
    const before = await row(sold.body.id);

    // Another saved size of the same product cannot be taken over.
    const taken = await call(`/saved/${sold.body.id}/variant`, 'PATCH', { url: selectedUrl(SIZE[38]), title: 'Asimetrik · 38' });
    expect(taken.status).toBe(409);
    for (const bad of [selectedUrl(SIZE[39].toUpperCase()), `${LUTVELIZADE_URL}?_butika_variant=lutvelizade:${PPV}`,
      `${selectedUrl(SIZE[39])}&_butika_variant=${encodeURIComponent(`lutvelizade:${PPV}:${SIZE[40]}`)}`]) {
      const refused = await call(`/saved/${sold.body.id}/variant`, 'PATCH', { url: bad, title: 'Asimetrik · ?' });
      expect(refused.status).toBe(400);
      expect((await refused.json() as { error: { code: string } }).error.code).toBe('invalid_variant');
    }
    const elsewhere = await call(`/saved/${sold.body.id}/variant`, 'PATCH', {
      url: selectedUrl(SIZE[39], PPV, 'https://www.lutvelizade.com.tr/asimetrik-kesim-caramel-kadin-terlik-modelleri-p'), title: 'Asimetrik · 39' });
    expect((await elsewhere.json() as { error: { code: string } }).error.code).toBe('different_product');
    expect(await row(sold.body.id)).toEqual(before);

    const changed = await call(`/saved/${sold.body.id}/variant`, 'PATCH', { url: selectedUrl(SIZE[39]), title: 'Asimetrik Kesim Siyah Kadın Terlik · 39' });
    expect(changed.status).toBe(200);
    const after = await row(sold.body.id);
    mine.push(after.tracked!);
    expect(after.url).toBe(selectedUrl(SIZE[39]));
    expect(after.tracked).not.toBe(before.tracked);
    expect(after.createdAt).toEqual(before.createdAt);
    expect(after).toMatchObject({ armed: null, confirmed: null });
    expect(await db.select().from(savedProductCollections).where(and(eq(savedProductCollections.savedProductId, sold.body.id),
      eq(savedProductCollections.collectionId, collection!.id)))).toHaveLength(1);
    await only(after.tracked!);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(after.tracked!)).toMatchObject({ price: 59996, availability: 'out_of_stock' });
    expect(await counted(after.tracked!)).toEqual(none);

    // Every notification and job of the account belongs to exactly one size here:
    // none is missed by the per-size count and none is counted twice.
    const perSize = await Promise.all([soldTracked, openTracked, after.tracked!].map(counted));
    expect(perSize.map(c => [c.notifications, c.outbox])).toEqual([[1, 1], [2, 2], [0, 0]]);
    expect(await totals()).toEqual({ notifications: 3, outbox: 3 });

    expect(unexpected).toEqual([]);
    // Nothing was handed to a device: the outbox worker is not run in this file.
    expect(pushes).toEqual([]);
    expect(device).toBeDefined();
  } finally {
    globalThis.fetch = realFetch;
    // Only this scenario's own rows; the shared country is left untouched.
    const tracked = [...new Set(mine)];
    if (tracked.length) await db.delete(trackedProducts).where(inArray(trackedProducts.id, tracked));
    await db.delete(users).where(eq(users.id, ids.user));
    await db.delete(boutiques).where(eq(boutiques.id, ids.boutique));
  }
}, 60000);
