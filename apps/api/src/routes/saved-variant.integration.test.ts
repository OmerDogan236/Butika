import { expect, test } from 'bun:test';
import { pickVariants, pickedUrl } from '../lib/price-tracking/ticimax-secim.fixture';

// Run separately against a disposable, migrated local database (see
// docs/bildirim-sistemi.md). This is the size-CHANGE route, PATCH /saved/:id/variant;
// the first save (POST /saved) is covered by release-safety and scheduler and is not
// retested here. scheduler.integration.test.ts already covers this route's ownership
// 404, foreign-store 400, repeated patch, 409 duplicate and the preserved collection,
// order number and creation date. What is added here: the URL the phone's picker
// produced is stored byte for byte, the tracked row follows it, and changing to a
// second size clears the stock alert that belonged to the first one.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('the picker URL is stored as sent and a second size drops the first size alert', async () => {
  const url = new URL(testUrl!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/butika_notification_test')) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../env');
  if (env.DATABASE_URL !== testUrl) throw new Error('Run this integration file separately');
  const { db } = await import('../lib/db');
  const { savedRoutes } = await import('./saved');
  const { signAccessToken } = await import('../lib/jwt');
  const { errorResponse } = await import('../lib/errors');
  const { Hono } = await import('hono');
  const { users, countries, boutiques, savedProducts, trackedProducts } = await import('@butika/db');
  const { eq, inArray } = await import('drizzle-orm');

  const app = new Hono().route('/saved', savedRoutes);
  app.onError((err, c) => errorResponse(c, err));
  const ids = { boutique: crypto.randomUUID(), user: crypto.randomUUID() };
  const host = `secim-${ids.boutique.slice(0, 8)}.example`;
  const productUrl = `https://www.${host}/madonna-yaka-bluz-435`;
  // The same capture helper the link test uses: these URLs come from rows the phone's
  // own picker produced for this page, not from identities retyped here.
  const rows = await pickVariants(undefined, productUrl);
  const stocked = rows.find(row => row.available === true)!;
  const soldOut = rows.find(row => row.available === false)!;
  const stockedUrl = await pickedUrl(stocked, productUrl);
  const soldOutUrl = await pickedUrl(soldOut, productUrl);

  try {
    await db.insert(countries).values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' }).onConflictDoNothing();
    await db.insert(boutiques).values({ id: ids.boutique, countryCode: 'TR', name: 'Seçim', url: `https://www.${host}`, coverImageUrl: '' });
    await db.insert(users).values({ id: ids.user, displayName: 'Seçim' });
    const [saved] = await db.insert(savedProducts).values({ userId: ids.user, boutiqueId: ids.boutique, url: productUrl,
      title: 'Madonna Yaka Bluz' }).returning();
    const token = await signAccessToken(ids.user);
    const patch = (body: unknown) => app.request(`/saved/${saved!.id}/variant`, { method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const row = async () => (await db.select().from(savedProducts).where(eq(savedProducts.id, saved!.id)))[0]!;
    const tracked = async (id: string) => (await db.select().from(trackedProducts).where(eq(trackedProducts.id, id)))[0]!;

    // 1. The URL the picker produced is stored byte for byte, tracking follows it.
    expect((await patch({ url: stockedUrl, title: 'Madonna Yaka Bluz - Siyah XS' })).status).toBe(200);
    const first = await row();
    expect(first.url).toBe(stockedUrl);
    expect(first.trackedProductId).not.toBeNull();
    expect((await tracked(first.trackedProductId!)).sourceUrl).toBe(stockedUrl);

    // 2. Arm the first size in the fixture, then prove from the database that the
    //    alert really is set before the second size is chosen. Writing these dates
    //    here is fixture setup, not a test of the alert-arming route itself.
    const armedAt = new Date(Date.now() - 60_000);
    await db.update(savedProducts).set({ restockAlertAt: armedAt, restockConfirmedAt: armedAt }).where(eq(savedProducts.id, saved!.id));
    const armed = await row();
    expect(armed.restockAlertAt).toEqual(armedAt);
    expect(armed.restockConfirmedAt).toEqual(armedAt);
    expect(armed.trackedProductId).toBe(first.trackedProductId!);

    // 3. Moving from one tracked size to another starts fresh: the first size's alert
    //    is not inherited by the second.
    expect((await patch({ url: soldOutUrl, title: 'Madonna Yaka Bluz - Siyah M' })).status).toBe(200);
    const second = await row();
    expect(second.url).toBe(soldOutUrl);
    expect(second.trackedProductId).not.toBe(first.trackedProductId!);
    expect((await tracked(second.trackedProductId!)).sourceUrl).toBe(soldOutUrl);
    expect(second.restockAlertAt).toBeNull();
    expect(second.restockConfirmedAt).toBeNull();

    // 4. A URL that names no size, or names another product, never reaches storage.
    for (const [status, code, body] of [
      [400, 'invalid_variant', { url: productUrl, title: 'Beden yok' }],
      [400, 'different_product', { url: await pickedUrl(stocked, `https://www.${host}/baska-urun-9`), title: 'Başka ürün' }],
    ] as const) {
      const response = await patch(body);
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ error: { code } });
    }
    expect((await row()).url).toBe(soldOutUrl);
  } finally {
    await db.delete(users).where(inArray(users.id, [ids.user]));
    await db.delete(trackedProducts).where(eq(trackedProducts.boutiqueId, ids.boutique));
    await db.delete(boutiques).where(eq(boutiques.id, ids.boutique));
  }
}, 30000);
