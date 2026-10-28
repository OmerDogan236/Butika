import { expect, test } from 'bun:test';

// What a size-less WooCommerce record does to the notification decision, through
// the real route, the real price check and the real observation recorder. The
// store's answers are fixtures and no push leaves the process: this is a local
// decision-chain proof, not evidence about production or a phone delivery.
// The file removes its own account, boutique, tracking, events and queue rows,
// so it may run beside the other integration tests on one database.
// Run this file separately against a disposable, migrated local database
// (docs/bildirim-sistemi.md, "Test"). Never use the development or production database.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('a size-less Woo record never turns a contradicted claim into a notification', async () => {
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
    priceDropEvents, restockEvents } = await import('@butika/db');
  const { ARAGON_VARIATIONS, WOO_URL, wooPage } = await import('./woo-variations.fixture');
  const { ARROW_VARIATIONS, GEBE_ARROW_URL, gebePage } = await import('./gebematernity.fixture');

  const app = new Hono().route('/saved', savedRoutes);
  app.onError((err, c) => errorResponse(c, err));
  const ids = { boutique: crypto.randomUUID(), gebeBoutique: crypto.randomUUID(), user: crypto.randomUUID() };
  const chosenUrl = `${WOO_URL}?_butika_variant=woo%3A1785897%3A1785901`;
  const uniform = (inStock: boolean, price = 1999) => ARAGON_VARIATIONS.map(v => ({ ...v, inStock, price }));
  const soldOut = wooPage({ variations: uniform(false), productLevelAvailability: 'https://schema.org/OutOfStock' });
  // The page the whole scenario turns on: every size but three in stock, and a
  // product-level claim that still says InStock.
  const contradicting = wooPage({ variations: ARAGON_VARIATIONS });

  // The store's answers, switched per phase. Nothing else may be requested, and
  // the push endpoint is captured instead of being called.
  let page = wooPage({ variations: uniform(true) });
  // gebematernity.com's page: its one variations form carries no action attribute.
  let gebe = gebePage();
  let variantPrice = '199900';
  const pushes: unknown[] = [];
  const unexpected: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const href = String(input instanceof Request ? input.url : input);
    if (href === 'https://exp.host/--/api/v2/push/send') {
      const batch = JSON.parse(String(init?.body)) as unknown[];
      pushes.push(...batch);
      return Response.json({ data: batch.map(() => ({ status: 'ok', id: crypto.randomUUID() })) });
    }
    if (href === WOO_URL) return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (href === GEBE_ARROW_URL) return new Response(gebe, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (href.endsWith('/wp-json/wc/store/v1/products/1785897')) {
      return Response.json({ id: 1785897, type: 'variable', permalink: WOO_URL, variations: [{ id: 1785901 }, { id: 1785904 }] });
    }
    if (href.endsWith('/wp-json/wc/store/v1/products/1785901')) {
      return Response.json({ id: 1785901, parent: 1785897, type: 'variation', permalink: WOO_URL,
        is_in_stock: true, is_purchasable: true, is_on_backorder: false,
        stock_availability: { class: 'in-stock', text: '' },
        prices: { price: variantPrice, currency_code: 'TRY', currency_minor_unit: 2 } });
    }
    unexpected.push(href);
    throw new Error(`Unexpected network request in test: ${href}`);
  }) as typeof fetch;

  const mine: string[] = [];
  try {
    await db.insert(countries).values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' }).onConflictDoNothing();
    await db.insert(boutiques).values([{ id: ids.boutique, countryCode: 'TR', name: 'Woo beden testi', url: 'https://www.pelinsenoglu.com', coverImageUrl: '' },
      { id: ids.gebeBoutique, countryCode: 'TR', name: 'Woo action olmayan form testi', url: 'https://gebematernity.com', coverImageUrl: '' }]);
    await db.insert(users).values({ id: ids.user, displayName: 'Woo beden testi' });
    const [device] = await db.insert(pushDevices).values({ userId: ids.user, installationId: crypto.randomUUID(),
      expoPushToken: `ExponentPushToken[${ids.user}]`, platform: 'android' }).returning({ id: pushDevices.id });
    const token = await signAccessToken(ids.user);
    const call = (path: string, method = 'GET', body?: unknown) => app.request(path, { method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const save = async (link: string, title: string, boutiqueId = ids.boutique) => {
      const response = await call('/saved', 'POST', { boutiqueId, url: link, title });
      return { status: response.status, body: await response.json() as { id: string } };
    };
    const trackedIdOf = async (savedId: string) => (await db.select({ id: savedProducts.trackedProductId })
      .from(savedProducts).where(eq(savedProducts.id, savedId)))[0]!.id;
    const due = async (id: string, isDue: boolean) => db.update(trackedProducts)
      .set({ nextCheckAt: new Date(Date.now() + (isDue ? -60_000 : 3_600_000)), checkLeaseToken: null, checkLeaseUntil: null })
      .where(eq(trackedProducts.id, id));
    const state = async (id: string) => (await db.select({ price: trackedProducts.currentPriceMinor,
      availability: trackedProducts.availability, baseline: trackedProducts.notificationBaselinePriceMinor,
      error: trackedProducts.lastError, failures: trackedProducts.consecutiveFailures })
      .from(trackedProducts).where(eq(trackedProducts.id, id)))[0]!;
    const alarm = async (savedId: string) => (await db.select({ armed: savedProducts.restockAlertAt,
      confirmed: savedProducts.restockConfirmedAt }).from(savedProducts).where(eq(savedProducts.id, savedId)))[0]!;

    // Every notification is bound to its product through its own event, never
    // through the account alone: one user may watch several products.
    const counted = async (trackedProductId: string) => {
      const rows = await db.select({ id: notifications.id, type: notifications.type,
        deviceId: pushOutbox.deviceId, token: pushOutbox.token })
        .from(notifications)
        .leftJoin(priceDropEvents, eq(priceDropEvents.id, notifications.priceDropEventId))
        .leftJoin(restockEvents, eq(restockEvents.id, notifications.restockEventId))
        .leftJoin(pushOutbox, eq(pushOutbox.notificationId, notifications.id))
        .where(and(eq(notifications.userId, ids.user),
          or(eq(priceDropEvents.trackedProductId, trackedProductId), eq(restockEvents.trackedProductId, trackedProductId))));
      return {
        notifications: new Set(rows.map(r => r.id)).size,
        outbox: rows.filter(r => r.deviceId !== null).length,
        types: [...new Set(rows.map(r => r.type))].sort(),
        devices: [...new Set(rows.map(r => r.deviceId).filter(Boolean))],
      };
    };
    const events = async (trackedProductId: string) => ({
      drops: (await db.select({ id: priceDropEvents.id }).from(priceDropEvents)
        .where(eq(priceDropEvents.trackedProductId, trackedProductId))).length,
      restocks: (await db.select({ id: restockEvents.id }).from(restockEvents)
        .where(eq(restockEvents.trackedProductId, trackedProductId))).length,
    });
    const none = { notifications: 0, outbox: 0, types: [], devices: [] };

    // ── 1. The route accepts a size-less Woo address and binds it to a product.
    const sizeless = await save(WOO_URL, 'Aragon takım');
    expect(sizeless.status).toBe(201);
    const sizelessTracked = (await trackedIdOf(sizeless.body.id))!;
    expect(sizelessTracked).not.toBeNull();
    const chosen = await save(chosenUrl, 'Aragon takım · bordo / small');
    const chosenTracked = (await trackedIdOf(chosen.body.id))!;
    expect(chosenTracked).not.toBeNull();
    expect(chosenTracked).not.toBe(sizelessTracked);
    mine.push(sizelessTracked, chosenTracked);

    // ── 2. A baseline exists only after a verified in-stock observation.
    await due(chosenTracked, false);
    await due(sizelessTracked, true);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(sizelessTracked)).toMatchObject({ price: 199900, availability: 'in_stock', baseline: 199900 });

    // ── 3. The price drops while the bound sizes contradict the product-level
    // claim: the state is unknown, so no baseline, no drop, nothing to notify.
    page = wooPage({ variations: ARAGON_VARIATIONS.map(v => ({ ...v, price: 1499 })), productLevelPrice: '1499.00' });
    await due(sizelessTracked, true);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(sizelessTracked)).toMatchObject({ price: 149900, availability: 'unknown', baseline: 199900 });
    expect(await events(sizelessTracked)).toEqual({ drops: 0, restocks: 0 });
    expect(await counted(sizelessTracked)).toEqual(none);

    // ── 4. The sizes state a price the product does not: the check fails and the
    // refused amount is not recorded. Only the failure count and error move.
    page = wooPage({ variations: uniform(true, 999) });
    await due(sizelessTracked, true);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, failed: 1 });
    const afterRefusal = await state(sizelessTracked);
    expect(afterRefusal.price).toBe(149900);
    expect(afterRefusal.baseline).toBe(199900);
    expect(afterRefusal.failures).toBe(1);
    expect(afterRefusal.error).toContain('WooCommerce variations');
    expect(await counted(sizelessTracked)).toEqual(none);

    // ── 5. A standing restock alarm, armed through the real route after a real
    // sold-out observation, is not disturbed by a contradicted claim.
    page = soldOut;
    await due(sizelessTracked, true);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(sizelessTracked)).toMatchObject({ availability: 'out_of_stock' });

    const armResponse = await call(`/saved/${sizeless.body.id}/restock-alert`, 'PUT');
    expect(armResponse.status).toBe(200);
    expect(await armResponse.json()).toMatchObject({ restockAlert: 'armed' });
    const armedRow = await alarm(sizeless.body.id);
    expect(armedRow.armed).not.toBeNull();
    expect(armedRow.confirmed).not.toBeNull();

    // The product-level claim says InStock again while three sizes are sold out.
    page = contradicting;
    await due(sizelessTracked, true);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(sizelessTracked)).toMatchObject({ availability: 'unknown' });
    // The alarm is still there, still confirmed, and nothing was fired.
    const afterContradiction = await alarm(sizeless.body.id);
    expect(afterContradiction.armed).toEqual(armedRow.armed);
    expect(afterContradiction.confirmed).toEqual(armedRow.confirmed);
    expect(await events(sizelessTracked)).toEqual({ drops: 0, restocks: 0 });
    expect(await counted(sizelessTracked)).toEqual(none);

    // ── 6. The positive control, kept apart from the alarm: a chosen size
    // resolved from the store's own parent and variation payloads.
    await due(sizelessTracked, false);
    await due(chosenTracked, true);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(chosenTracked)).toMatchObject({ price: 199900, availability: 'in_stock', baseline: 199900 });
    expect(await counted(chosenTracked)).toEqual(none);

    variantPrice = '149900';
    await due(chosenTracked, true);
    expect(await runPriceTrackingBatch()).toMatchObject({ selected: 1, success: 1 });
    expect(await state(chosenTracked)).toMatchObject({ price: 149900, availability: 'in_stock', baseline: 149900 });
    expect(await events(chosenTracked)).toEqual({ drops: 1, restocks: 0 });
    expect(await counted(chosenTracked)).toEqual({ notifications: 1, outbox: 1, types: ['price_drop'], devices: [device!.id] });

    // The same observation again adds neither a second notification nor a job.
    await due(chosenTracked, true);
    await runPriceTrackingBatch();
    expect(await counted(chosenTracked)).toEqual({ notifications: 1, outbox: 1, types: ['price_drop'], devices: [device!.id] });
    // And the size-less product still has nothing of its own: this is what a
    // count bound only to the account would have got wrong.
    expect(await counted(sizelessTracked)).toEqual(none);

    // ── 7. gebematernity.com writes its one variations form without an action
    // attribute. Bound by its product ids (woo-variation-stock.ts), a contradicted
    // claim there is unknown too, and a standing alarm is neither fired nor cleared
    // by it. The page is the fixture built on the one fetched 2026-09-22 (two of
    // twelve variations in stock); every price and later state here is made up.
    const gebeSaved = await save(GEBE_ARROW_URL, 'Cardigan for Pregnancy', ids.gebeBoutique);
    expect(gebeSaved.status).toBe(201);
    const gebeTracked = (await trackedIdOf(gebeSaved.body.id))!;
    expect(gebeTracked).not.toBeNull();
    mine.push(gebeTracked);
    const gebeCheck = async (next: string) => {
      gebe = next;
      await due(sizelessTracked, false);
      await due(chosenTracked, false);
      await due(gebeTracked, true);
      return runPriceTrackingBatch();
    };
    const gebeEvery = (inStock: boolean, price: number) => ARROW_VARIATIONS.map(v => ({ ...v, inStock, price }));
    expect(await gebeCheck(gebePage({ variations: gebeEvery(true, 213.85) }))).toMatchObject({ selected: 1, success: 1 });
    expect(await state(gebeTracked)).toMatchObject({ price: 21385, availability: 'in_stock', baseline: 21385 });
    // The two of twelve at a lower price under an InStock claim: no baseline, no drop.
    const gebeMixed = (price: string) => gebePage({ price, variations: ARROW_VARIATIONS.map(v => ({ ...v, price: Number(price) })) });
    expect(await gebeCheck(gebeMixed('199.95'))).toMatchObject({ selected: 1, success: 1 });
    expect(await state(gebeTracked)).toMatchObject({ price: 19995, availability: 'unknown', baseline: 21385 });
    expect(await events(gebeTracked)).toEqual({ drops: 0, restocks: 0 });
    expect(await counted(gebeTracked)).toEqual(none);
    // Sold out everywhere, then the alarm; the mixed page again leaves it as it was.
    expect(await gebeCheck(gebePage({ price: '199.95', availability: 'OutOfStock', variations: gebeEvery(false, 199.95) })))
      .toMatchObject({ selected: 1, success: 1 });
    expect(await state(gebeTracked)).toMatchObject({ availability: 'out_of_stock' });
    const gebeArm = await call(`/saved/${gebeSaved.body.id}/restock-alert`, 'PUT');
    expect(await gebeArm.json()).toMatchObject({ restockAlert: 'armed' });
    const gebeAlarm = await alarm(gebeSaved.body.id);
    expect(await gebeCheck(gebeMixed('189.95'))).toMatchObject({ selected: 1, success: 1 });
    expect(await state(gebeTracked)).toMatchObject({ price: 18995, availability: 'unknown', baseline: 21385 });
    expect(await alarm(gebeSaved.body.id)).toEqual(gebeAlarm);
    expect(await events(gebeTracked)).toEqual({ drops: 0, restocks: 0 });
    expect(await counted(gebeTracked)).toEqual(none);
    // Control: every size back at the lower price. The alarm fires once; one account
    // with an alarm gets the restock, not a second notice for the drop.
    const gebeBack = gebePage({ price: '189.95', variations: gebeEvery(true, 189.95) });
    expect(await gebeCheck(gebeBack)).toMatchObject({ selected: 1, success: 1 });
    expect(await state(gebeTracked)).toMatchObject({ price: 18995, availability: 'in_stock', baseline: 18995 });
    expect(await events(gebeTracked)).toEqual({ drops: 1, restocks: 1 });
    expect(await counted(gebeTracked)).toEqual({ notifications: 1, outbox: 1, types: ['back_in_stock'], devices: [device!.id] });
    expect(await alarm(gebeSaved.body.id)).toMatchObject({ armed: null, confirmed: null });
    // The same observation again adds nothing.
    await gebeCheck(gebeBack);
    expect(await events(gebeTracked)).toEqual({ drops: 1, restocks: 1 });
    expect(await counted(gebeTracked)).toEqual({ notifications: 1, outbox: 1, types: ['back_in_stock'], devices: [device!.id] });

    expect(unexpected).toEqual([]);
    // Nothing was handed to a device: the outbox worker is not run in this file.
    expect(pushes).toEqual([]);
  } finally {
    globalThis.fetch = realFetch;
    // Only this scenario's own rows. The shared country and any other test's
    // records are left untouched.
    if (mine.length) await db.delete(trackedProducts).where(inArray(trackedProducts.id, mine));
    await db.delete(users).where(eq(users.id, ids.user));
    await db.delete(boutiques).where(inArray(boutiques.id, [ids.boutique, ids.gebeBoutique]));
  }
});
