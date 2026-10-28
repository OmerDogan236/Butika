import { notifications, priceDropEvents, productPriceHistory, restockEvents, savedProducts, trackedProducts, pushDevices, pushOutbox, users } from '@butika/db';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { db } from '../db';
import { priceDropMessage } from '../push/price-drop-message';
import { restockMessage } from '../push/restock-message';
import type { Availability } from './availability';

export type PriceObservationMode = 'market_observation' | 'rebaseline';
type RecordPriceObservationInput = {
  trackedProductId: string; priceMinor: number; currency: string;
  observedAt?: Date; mode?: PriceObservationMode; availability?: Availability;
  checkLeaseToken?: string;
};
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TrackedProduct = typeof trackedProducts.$inferSelect;

export async function recordPriceObservation(input: RecordPriceObservationInput): Promise<void> {
  if (!Number.isSafeInteger(input.priceMinor) || input.priceMinor <= 0) throw new Error(`Invalid price observation: ${input.priceMinor}`);
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`Invalid currency observation: ${input.currency}`);
  const observedAt = input.observedAt ?? new Date();
  if (!Number.isFinite(observedAt.getTime())) throw new Error('Invalid observation time');
  const availability = input.availability ?? 'unknown';
  const available = availability === 'in_stock';
  await db.transaction(async tx => {
    const [existing] = await tx.select().from(trackedProducts)
      .where(eq(trackedProducts.id, input.trackedProductId)).limit(1).for('update');
    if (!existing) throw new Error('Tracked product not found');
    if (input.checkLeaseToken && (existing.checkLeaseToken !== input.checkLeaseToken ||
      !existing.checkLeaseUntil || existing.checkLeaseUntil.getTime() <= Date.now())) throw new Error('Price tracking lease expired');
    if (existing.lastSuccessAt && observedAt <= existing.lastSuccessAt) return;

    // Establish the notification baseline only with verified stock. Existing
    // historical prices are deliberately not backfilled as trustworthy.
    const previous = existing.notificationBaselinePriceMinor;
    const drop = input.mode !== 'rebaseline' && available && previous !== null &&
      existing.notificationBaselineCurrency === currency && input.priceMinor < previous;
    const changed = existing.currentPriceMinor !== input.priceMinor || existing.currency !== currency;
    await tx.update(trackedProducts).set({
      currentPriceMinor: input.priceMinor, currency, availability,
      ...(available ? { notificationBaselinePriceMinor: input.priceMinor, notificationBaselineCurrency: currency, notificationBaselineAt: observedAt }
        : input.mode === 'rebaseline' ? { notificationBaselinePriceMinor: null, notificationBaselineCurrency: null, notificationBaselineAt: null } : {}),
      lastSuccessAt: observedAt, lastError: null, consecutiveFailures: 0, updatedAt: observedAt,
    }).where(eq(trackedProducts.id, input.trackedProductId));
    // Restock alerts follow verified stock only; a re-baseline is neither a
    // sell-out nor a return.
    let restocked = new Set<string>();
    if (input.mode !== 'rebaseline') {
      if (availability === 'out_of_stock') await confirmRestockAlerts(tx, existing.id, observedAt);
      else if (available) restocked = await fireRestockAlerts(tx, { existing, priceMinor: input.priceMinor, currency, observedAt,
        previousPriceMinor: existing.notificationBaselineCurrency === currency ? previous : null });
    }
    if (!changed && !drop) return;
    const [history] = await tx.insert(productPriceHistory).values({ trackedProductId: input.trackedProductId,
      priceMinor: input.priceMinor, currency, observedAt }).returning({ id: productPriceHistory.id });
    if (!history) throw new Error('Price history insert failed');
    if (!drop || previous === null) return;
    const [event] = await tx.insert(priceDropEvents).values({ trackedProductId: input.trackedProductId,
      priceHistoryId: history.id, previousPriceMinor: previous, newPriceMinor: input.priceMinor, currency, detectedAt: observedAt,
    }).onConflictDoNothing({ target: priceDropEvents.priceHistoryId }).returning({ id: priceDropEvents.id });
    if (!event) return;
    // A newly joined watcher first needs a server-observed in-stock baseline.
    // Do not notify them about a drop relative to a price observed before saving.
    if (!existing.notificationBaselineAt) return;
    // Every watcher is addressed with their own saved title and link: titles are
    // client-supplied, so one user's text is never shown to another. Deleted
    // accounts (awaiting the 30-day purge) are not notified.
    const saves = await tx.select({ userId: savedProducts.userId, title: savedProducts.title, url: savedProducts.url })
      .from(savedProducts).innerJoin(users, eq(users.id, savedProducts.userId))
      .where(and(eq(savedProducts.trackedProductId, input.trackedProductId),
        lte(savedProducts.trackingStartedAt, existing.notificationBaselineAt), isNull(users.deletedAt)))
      .orderBy(asc(savedProducts.userId), desc(savedProducts.createdAt));
    const watchers = new Map<string, { title: string; url: string }>();
    // Somebody told "back in stock" by this same observation gets no second push.
    for (const save of saves) if (!watchers.has(save.userId) && !restocked.has(save.userId)) watchers.set(save.userId, { title: save.title, url: save.url });
    if (!watchers.size) return;
    const created = await tx.insert(notifications).values([...watchers.keys()].map(userId => ({
      userId, type: 'price_drop', priceDropEventId: event.id, createdAt: observedAt,
    }))).onConflictDoNothing().returning({ id: notifications.id, userId: notifications.userId });
    if (!created.length) return;
    const devices = await tx.select().from(pushDevices).where(and(
      inArray(pushDevices.userId, created.map(n => n.userId)), eq(pushDevices.enabled, true),
    ));
    const rows = devices.map(device => {
      const watcher = watchers.get(device.userId);
      return { notificationId: created.find(n => n.userId === device.userId)!.id,
        deviceId: device.id, token: device.expoPushToken,
        message: priceDropMessage({ eventId: event.id, trackedProductId: input.trackedProductId,
          boutiqueId: existing.boutiqueId, productTitle: watcher?.title ?? null, sourceUrl: watcher?.url ?? existing.sourceUrl,
          previousPriceMinor: previous, newPriceMinor: input.priceMinor, currency }),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
    });
    if (rows.length) await tx.insert(pushOutbox).values(rows).onConflictDoNothing();
  });
}

// The server has now seen this size sold out: pending alerts become live.
async function confirmRestockAlerts(tx: Tx, trackedProductId: string, observedAt: Date) {
  await tx.update(savedProducts).set({ restockConfirmedAt: observedAt }).where(and(
    eq(savedProducts.trackedProductId, trackedProductId), isNotNull(savedProducts.restockAlertAt),
    isNull(savedProducts.restockConfirmedAt), lte(savedProducts.restockAlertAt, observedAt),
  ));
}

// Answers every alert armed before this in-stock observation, once. A confirmed
// alert gets a back_in_stock notification; an unconfirmed one (the server never
// saw the size sold out) lapses silently. Returns the users notified.
async function fireRestockAlerts(tx: Tx, input: { existing: TrackedProduct; priceMinor: number; currency: string;
  previousPriceMinor: number | null; observedAt: Date }): Promise<Set<string>> {
  const armed = await tx.select({ id: savedProducts.id, userId: savedProducts.userId, title: savedProducts.title,
    url: savedProducts.url, confirmedAt: savedProducts.restockConfirmedAt, deletedAt: users.deletedAt })
    .from(savedProducts).innerJoin(users, eq(users.id, savedProducts.userId))
    .where(and(eq(savedProducts.trackedProductId, input.existing.id), isNotNull(savedProducts.restockAlertAt),
      lte(savedProducts.restockAlertAt, input.observedAt)))
    .orderBy(asc(savedProducts.userId), desc(savedProducts.createdAt));
  if (!armed.length) return new Set();
  await tx.update(savedProducts).set({ restockAlertAt: null, restockConfirmedAt: null })
    .where(inArray(savedProducts.id, armed.map(save => save.id)));
  const watchers = new Map<string, { title: string; url: string }>();
  for (const save of armed) if (save.confirmedAt && !save.deletedAt && !watchers.has(save.userId)) watchers.set(save.userId, { title: save.title, url: save.url });
  if (!watchers.size) return new Set();
  const [event] = await tx.insert(restockEvents).values({ trackedProductId: input.existing.id, priceMinor: input.priceMinor,
    previousPriceMinor: input.previousPriceMinor, currency: input.currency, detectedAt: input.observedAt,
  }).onConflictDoNothing().returning({ id: restockEvents.id });
  if (!event) return new Set();
  const created = await tx.insert(notifications).values([...watchers.keys()].map(userId => ({
    userId, type: 'back_in_stock', restockEventId: event.id, createdAt: input.observedAt,
  }))).onConflictDoNothing().returning({ id: notifications.id, userId: notifications.userId });
  if (!created.length) return new Set();
  const devices = await tx.select().from(pushDevices).where(and(
    inArray(pushDevices.userId, created.map(n => n.userId)), eq(pushDevices.enabled, true),
  ));
  const rows = devices.map(device => {
    const watcher = watchers.get(device.userId)!;
    return { notificationId: created.find(n => n.userId === device.userId)!.id,
      deviceId: device.id, token: device.expoPushToken,
      message: restockMessage({ eventId: event.id, trackedProductId: input.existing.id, boutiqueId: input.existing.boutiqueId,
        productTitle: watcher.title, sourceUrl: watcher.url, priceMinor: input.priceMinor,
        previousPriceMinor: input.previousPriceMinor, currency: input.currency }),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  });
  if (rows.length) await tx.insert(pushOutbox).values(rows).onConflictDoNothing();
  return new Set(created.map(n => n.userId));
}
