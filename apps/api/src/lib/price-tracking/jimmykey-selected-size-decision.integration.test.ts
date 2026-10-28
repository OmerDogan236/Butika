import { expect, test } from 'bun:test';

// A chosen jimmykey size, jimmykey:<ProductID>:<ColorID>:<SizeID>, through the real save
// and size-change routes, the real price check and the real observation recorder. The
// store's pages are fixtures built on the page fetched 2026-09-22 (S on sale; M, L and XL
// sold out under a product-level InStock) and on another product's colour fetched 2026-09-27
// with every size sold out; every later state is made up, and the store
// keeping a size's id when it comes back is the assumption under test, not an
// observation. No push leaves the process: this is a local decision-chain proof, not
// evidence about production or a phone delivery. The file removes its own account,
// boutique, tracking, events and queue rows.
// Run this file separately against a disposable, migrated local database
// (docs/bildirim-sistemi.md, "Test"). Never use the development or production database.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('a chosen jimmykey size: saved, checked, alerted and changed without a false notification', async () => {
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
  const { JIMMYKEY_URL, JIMMYKEY_BLACK_URL, JIMMYKEY_PRODUCT_ID, JIMMYKEY_SIZES, jimmykeyPage, selectedUrl,
    JIMMYKEY_SOLD_OUT_URL, JIMMYKEY_SOLD_OUT_PRODUCT, JIMMYKEY_SOLD_OUT_SIZES, jimmykeySoldOutPage } = await import('./jimmykey.fixture');

  const app = new Hono().route('/saved', savedRoutes);
  app.onError((err, c) => errorResponse(c, err));
  const ids = { boutique: crypto.randomUUID(), user: crypto.randomUUID() };
  const sizes = (change: Record<string, boolean>, drop: string[] = []) => JIMMYKEY_SIZES.filter(s => !drop.includes(s.id))
    .map(s => (s.id in change ? { ...s, onSale: change[s.id]! } : s));

  // The store's answers, switched per phase. Only the colour pages may be requested.
  let page = jimmykeyPage();
  let soldOutPage = jimmykeySoldOutPage();
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
    if (href === JIMMYKEY_URL) { requested.push(href); return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } }); }
    if (href === JIMMYKEY_SOLD_OUT_URL) { requested.push(href); return new Response(soldOutPage, { headers: { 'content-type': 'text/html; charset=utf-8' } }); }
    unexpected.push(href);
    throw new Error(`Unexpected network request in test: ${href}`);
  }) as typeof fetch;

  const mine: string[] = [];
  try {
    await db.insert(countries).values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' }).onConflictDoNothing();
    await db.insert(boutiques).values({ id: ids.boutique, countryCode: 'TR', name: 'Jimmy Key beden testi', url: 'https://www.jimmykey.com', coverImageUrl: '' });
    await db.insert(users).values({ id: ids.user, displayName: 'Jimmy Key beden testi' });
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
      availability: trackedProducts.availability, error: trackedProducts.lastError, failures: trackedProducts.consecutiveFailures,
      baseline: trackedProducts.notificationBaselinePriceMinor, baselineAt: trackedProducts.notificationBaselineAt })
      .from(trackedProducts).where(eq(trackedProducts.id, id)))[0]!;
    // Every notification is bound to its size through its own event, a restock or a
    // price drop, never through the account alone: the account watches several sizes.
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
    const totals = async () => ({
      notifications: (await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.userId, ids.user))).length,
      outbox: (await db.select({ id: pushOutbox.id }).from(pushOutbox).innerJoin(notifications, eq(notifications.id, pushOutbox.notificationId))
        .where(eq(notifications.userId, ids.user))).length,
    });
    const none = { notifications: 0, outbox: 0, types: [], devices: [] };

    // ── 1. The route keeps the chosen size in the address: one tracking per size.
    const sold = await save(selectedUrl('86'), 'Boat Neck Blouse · M');
    const open = await save(selectedUrl('71'), 'Boat Neck Blouse · S');
    expect([sold.status, open.status]).toEqual([201, 201]);
    const soldTracked = (await row(sold.body.id)).tracked!;
    const openTracked = (await row(open.body.id)).tracked!;
    mine.push(soldTracked, openTracked);
    expect(soldTracked).not.toBe(openTracked);
    expect((await row(sold.body.id)).url).toBe(selectedUrl('86'));
    expect(new URL((await state(soldTracked)).canonicalUrl).searchParams.getAll('_butika_variant')).toEqual([`jimmykey:${JIMMYKEY_PRODUCT_ID}:61:86`]);
    expect(new URL((await state(openTracked)).canonicalUrl).searchParams.getAll('_butika_variant')).toEqual([`jimmykey:${JIMMYKEY_PRODUCT_ID}:61:71`]);

    // ── 2. The page as fetched: on one colour page under one InStock claim, M is sold
    // out and S is on sale, each by its own entry, both at the page's price.
    await only(soldTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    await only(openTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(soldTracked)).toMatchObject({ price: 69995, availability: 'out_of_stock', baseline: null });
    expect(await state(openTracked)).toMatchObject({ price: 69995, availability: 'in_stock', baseline: 69995 });
    expect(requested).toEqual([JIMMYKEY_URL, JIMMYKEY_URL]);

    // "Stok gelince haber ver" on the sold-out size arms at once; the size on sale refuses.
    const armResponse = await call(`/saved/${sold.body.id}/restock-alert`, 'PUT');
    expect(armResponse.status).toBe(200);
    expect(await armResponse.json()).toMatchObject({ restockAlert: 'armed' });
    expect((await (await call(`/saved/${open.body.id}/restock-alert`, 'PUT')).json() as { error: { code: string } }).error.code).toBe('already_in_stock');
    const armed = await row(sold.body.id);
    const soldBefore = await state(soldTracked);

    // ── 3. Synthetic: M gone from the list, M twice, and a block that cannot be bound.
    // Each check fails with its reason; the last verified price, stock and baseline stay,
    // the alarm stands, and nothing is recorded or sent.
    const lost: [string, string][] = [
      [jimmykeyPage({ sizes: sizes({}, ['86']) }), 'size not on page'],
      [jimmykeyPage({ sizes: [...JIMMYKEY_SIZES, { id: '86', label: 'XXL', onSale: true }] }), 'size list: a size id repeated'],
      [jimmykeyPage({ blocks: 2 }), 'product block: several product blocks'],
    ];
    for (const [index, [next, reason]] of lost.entries()) {
      page = next;
      await only(soldTracked);
      expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, failed: 1 });
      expect(await state(soldTracked)).toEqual({ ...soldBefore, error: `not_found: Selected jimmykey size cannot be verified: ${reason}`, failures: index + 1 });
      expect(await row(sold.body.id)).toMatchObject({ armed: armed.armed, confirmed: armed.confirmed });
      expect(await events(soldTracked)).toEqual({ drops: 0, restocks: 0 });
      expect(await counted(soldTracked)).toEqual(none);
    }

    // ── 4. Synthetic: M back on sale under the same id. One back-in-stock, once.
    page = jimmykeyPage({ sizes: sizes({ 86: true }) });
    await only(soldTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(soldTracked)).toMatchObject({ price: 69995, availability: 'in_stock', failures: 0 });
    expect(await events(soldTracked)).toEqual({ drops: 0, restocks: 1 });
    expect(await counted(soldTracked)).toEqual({ notifications: 1, outbox: 1, types: ['back_in_stock'], devices: [device!.id] });
    expect((await row(sold.body.id)).armed).toBeNull();
    await only(soldTracked);
    await runPriceTrackingBatch();
    expect(await counted(soldTracked)).toEqual({ notifications: 1, outbox: 1, types: ['back_in_stock'], devices: [device!.id] });
    // The size that never sold out has nothing of its own.
    expect(await counted(openTracked)).toEqual(none);

    // ── 5. Synthetic: the colour page gets cheaper while S stays on sale (JSON-LD and the
    // add-to-bag amount move together). One price drop, one notification, one job for this
    // device; the same observation again adds nothing; M is not touched.
    const untouchedM = async () => ({ state: await state(soldTracked), counted: await counted(soldTracked), events: await events(soldTracked) });
    const beforeM = await untouchedM();
    page = jimmykeyPage({ sizes: sizes({ 86: true }), price: '599.95' });
    await only(openTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(openTracked)).toMatchObject({ price: 59995, availability: 'in_stock' });
    expect(await events(openTracked)).toEqual({ drops: 1, restocks: 0 });
    expect(await counted(openTracked)).toEqual({ notifications: 1, outbox: 1, types: ['price_drop'], devices: [device!.id] });
    expect(await untouchedM()).toEqual(beforeM);
    await only(openTracked);
    await runPriceTrackingBatch();
    expect(await events(openTracked)).toEqual({ drops: 1, restocks: 0 });
    expect(await counted(openTracked)).toEqual({ notifications: 1, outbox: 1, types: ['price_drop'], devices: [device!.id] });
    expect(await totals()).toEqual({ notifications: 2, outbox: 2 });

    // ── 6. Synthetic: S sells out, its alert is armed, and it comes back cheaper in one
    // observation. Both events are recorded; the owner of the alert gets back_in_stock
    // only, with one job: the existing priority, unchanged.
    page = jimmykeyPage({ sizes: sizes({ 71: false, 86: true }), price: '599.95' });
    await only(openTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(openTracked)).toMatchObject({ price: 59995, availability: 'out_of_stock' });
    expect((await (await call(`/saved/${open.body.id}/restock-alert`, 'PUT')).json() as { restockAlert: string }).restockAlert).toBe('armed');
    page = jimmykeyPage({ sizes: sizes({ 86: true }), price: '499.95' });
    await only(openTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(openTracked)).toMatchObject({ price: 49995, availability: 'in_stock' });
    expect(await events(openTracked)).toEqual({ drops: 2, restocks: 1 });
    expect(await counted(openTracked)).toEqual({ notifications: 2, outbox: 2, types: ['back_in_stock', 'price_drop'], devices: [device!.id] });
    const [latestDrop] = await db.select({ id: priceDropEvents.id, from: priceDropEvents.previousPriceMinor, to: priceDropEvents.newPriceMinor })
      .from(priceDropEvents).where(eq(priceDropEvents.trackedProductId, openTracked)).orderBy(desc(priceDropEvents.detectedAt)).limit(1);
    expect(latestDrop).toMatchObject({ from: 59995, to: 49995 });
    expect(await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.priceDropEventId, latestDrop!.id))).toHaveLength(0);
    expect((await row(open.body.id)).armed).toBeNull();
    await only(openTracked);
    await runPriceTrackingBatch();
    expect(await events(openTracked)).toEqual({ drops: 2, restocks: 1 });
    expect(await counted(openTracked)).toEqual({ notifications: 2, outbox: 2, types: ['back_in_stock', 'price_drop'], devices: [device!.id] });
    expect(await untouchedM()).toEqual(beforeM);
    expect(await totals()).toEqual({ notifications: 3, outbox: 3 });

    // ── 7. An identity that cannot be read is saved by the general route as before, but
    // its check starts no reading: nothing is fetched, recorded or sent.
    const unreadable = await save(`${JIMMYKEY_URL}?_butika_variant=${encodeURIComponent(`jimmykey:${JIMMYKEY_PRODUCT_ID}:12:86`)}`, 'Boat Neck Blouse · ?');
    expect(unreadable.status).toBe(201);
    const unreadableTracked = (await row(unreadable.body.id)).tracked!;
    mine.push(unreadableTracked);
    const fetchedBefore = requested.length;
    await only(unreadableTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, failed: 1 });
    expect(requested.length).toBe(fetchedBefore);
    expect(await state(unreadableTracked)).toMatchObject({ price: null, availability: 'unknown', error: 'not_found: A jimmykey size cannot be verified' });
    expect(await counted(unreadableTracked)).toEqual(none);

    // ── 8. Changing the saved size keeps the save, its collections and its date, and
    // starts the new size without the old size's alert. Another colour is another page.
    const [collection] = await db.insert(collections).values({ userId: ids.user, name: 'Bluzlar' }).returning({ id: collections.id });
    expect((await call(`/saved/${sold.body.id}/collections`, 'POST', { collectionIds: [collection!.id] })).status).toBe(200);
    page = jimmykeyPage();
    await only(soldTracked);
    await runPriceTrackingBatch();
    expect((await (await call(`/saved/${sold.body.id}/restock-alert`, 'PUT')).json() as { restockAlert: string }).restockAlert).toBe('armed');
    const before = await row(sold.body.id);

    // Another saved size of the same product cannot be taken over.
    expect((await call(`/saved/${sold.body.id}/variant`, 'PATCH', { url: selectedUrl('71'), title: 'Boat Neck Blouse · S' })).status).toBe(409);
    for (const bad of [`${JIMMYKEY_URL}?_butika_variant=${encodeURIComponent(`JIMMYKEY:${JIMMYKEY_PRODUCT_ID}:61:75`)}`,
      `${JIMMYKEY_URL}?_butika_variant=${encodeURIComponent(`jimmykey:${JIMMYKEY_PRODUCT_ID}:61`)}`,
      `${selectedUrl('75')}&_butika_variant=${encodeURIComponent(`jimmykey:${JIMMYKEY_PRODUCT_ID}:61:80`)}`,
      selectedUrl('75', { colourId: '12' })]) {
      const refused = await call(`/saved/${sold.body.id}/variant`, 'PATCH', { url: bad, title: 'Boat Neck Blouse · ?' });
      expect(refused.status).toBe(400);
      expect((await refused.json() as { error: { code: string } }).error.code).toBe('invalid_variant');
    }
    const otherColour = await call(`/saved/${sold.body.id}/variant`, 'PATCH', {
      url: selectedUrl('75', { colourId: '12', page: JIMMYKEY_BLACK_URL }), title: 'Boat Neck Blouse · L' });
    expect(otherColour.status).toBe(400);
    expect((await otherColour.json() as { error: { code: string } }).error.code).toBe('different_product');
    expect(await row(sold.body.id)).toEqual(before);

    const changed = await call(`/saved/${sold.body.id}/variant`, 'PATCH', { url: selectedUrl('75'), title: 'Boat Neck Blouse · L' });
    expect(changed.status).toBe(200);
    const after = await row(sold.body.id);
    mine.push(after.tracked!);
    expect(after.url).toBe(selectedUrl('75'));
    expect(after.tracked).not.toBe(before.tracked);
    expect(after.createdAt).toEqual(before.createdAt);
    expect(after).toMatchObject({ armed: null, confirmed: null });
    expect(await db.select().from(savedProductCollections).where(and(eq(savedProductCollections.savedProductId, sold.body.id),
      eq(savedProductCollections.collectionId, collection!.id)))).toHaveLength(1);
    await only(after.tracked!);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(after.tracked!)).toMatchObject({ price: 69995, availability: 'out_of_stock' });
    expect(await counted(after.tracked!)).toEqual(none);

    // ── 9. A colour sold out in every size (white/518 as fetched 2026-09-27): no add-to-bag
    // button, the notify-me link in its place. A chosen size is read sold out from its own
    // entry and its alert is confirmed at once; a block that cannot be bound leaves the alert
    // and sends nothing; the colour back with an add-to-bag button and the size on sale (made
    // up) gives one back-in-stock.
    const whiteUrl = (sizeId: string) => selectedUrl(sizeId, { productId: JIMMYKEY_SOLD_OUT_PRODUCT.id, colourId: '518', page: JIMMYKEY_SOLD_OUT_URL });
    const white = await save(whiteUrl('87'), 'Denim Pants · 36');
    expect(white.status).toBe(201);
    const whiteTracked = (await row(white.body.id)).tracked!;
    mine.push(whiteTracked);
    await only(whiteTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(whiteTracked)).toMatchObject({ price: 169995, availability: 'out_of_stock', baseline: null, failures: 0 });
    expect(await (await call(`/saved/${white.body.id}/restock-alert`, 'PUT')).json()).toMatchObject({ restockAlert: 'armed' });
    const whiteArmed = await row(white.body.id);
    expect(whiteArmed.confirmed).not.toBeNull();
    soldOutPage = jimmykeySoldOutPage({ favourite: null });
    await only(whiteTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, failed: 1 });
    expect(await state(whiteTracked)).toMatchObject({ availability: 'out_of_stock', failures: 1,
      error: 'not_found: Selected jimmykey size cannot be verified: product block: favourite button' });
    expect(await row(white.body.id)).toMatchObject({ armed: whiteArmed.armed, confirmed: whiteArmed.confirmed });
    expect(await counted(whiteTracked)).toEqual(none);
    soldOutPage = jimmykeySoldOutPage({ basket: true, notify: null, sizes: JIMMYKEY_SOLD_OUT_SIZES.map(s => ({ ...s, onSale: s.id === '87' })) });
    await only(whiteTracked);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(whiteTracked)).toMatchObject({ price: 169995, availability: 'in_stock', failures: 0 });
    expect(await events(whiteTracked)).toEqual({ drops: 0, restocks: 1 });
    expect(await counted(whiteTracked)).toEqual({ notifications: 1, outbox: 1, types: ['back_in_stock'], devices: [device!.id] });
    expect((await row(white.body.id)).armed).toBeNull();

    // Every notification and job of the account belongs to exactly one size here.
    const perSize = await Promise.all([soldTracked, openTracked, unreadableTracked, after.tracked!, whiteTracked].map(counted));
    expect(perSize.map(c => [c.notifications, c.outbox])).toEqual([[1, 1], [2, 2], [0, 0], [0, 0], [1, 1]]);
    expect(await totals()).toEqual({ notifications: 4, outbox: 4 });

    expect(unexpected).toEqual([]);
    // Nothing was handed to a device: the outbox worker is not run in this file.
    expect(pushes).toEqual([]);
    expect(device).toBeDefined();
  } finally {
    globalThis.fetch = realFetch;
    // Only this scenario's own rows; the shared country is left untouched. A step that
    // fails after creating a tracking, before listing it, still leaves it on this boutique.
    const tracked = [...new Set(mine)];
    await db.delete(trackedProducts).where(tracked.length
      ? or(inArray(trackedProducts.id, tracked), eq(trackedProducts.boutiqueId, ids.boutique))
      : eq(trackedProducts.boutiqueId, ids.boutique));
    await db.delete(users).where(eq(users.id, ids.user));
    await db.delete(boutiques).where(eq(boutiques.id, ids.boutique));
  }
}, 90000);
