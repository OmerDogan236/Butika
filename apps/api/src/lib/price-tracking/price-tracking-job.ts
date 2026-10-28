import { boutiques, trackedProducts, savedProducts, users } from '@butika/db';
import { and, asc, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../logger';
import { resolveProductPrice } from './price-source-router';
import { recordPriceObservation } from './record-price-observation';
import { retailerFetch } from './retailer-http';
import { CHECK_LEASE_MS, nextFailureCheck, nextSuccessCheck } from './check-schedule';
import { backfillSavedTrackingBatch } from './backfill-saved-tracking';
import { pazarBaglami, pazarParaBirimi, pazarParaUyusmazligi } from './pazar';

let jobRunning = false;
let backfillCursor:string|null=null;
export type PriceTrackingBatchResult = { selected: number; success: number; failed: number; blocked: number };

export async function claimPriceChecks(limit = 25) {
  return db.transaction(async tx => {
    const now = new Date();
    const rows = await tx.select().from(trackedProducts).where(and(
      // Only products that a non-deleted account still watches are fetched.
      sql`exists (select 1 from ${savedProducts} inner join ${users} on ${users.id} = ${savedProducts.userId}
        where ${savedProducts.trackedProductId} = ${trackedProducts.id} and ${users.deletedAt} is null)`,
      eq(trackedProducts.trackingStatus, 'active'), or(lte(trackedProducts.nextCheckAt, now),
        // A new watcher needs an observation after saving, even when this shared
        // product was checked earlier today. Preserve failure backoff and allow
        // at most one refresh per minute under repeated saves.
        and(eq(trackedProducts.consecutiveFailures, 0),
          sql`${trackedProducts.lastSuccessAt} <= now() - interval '1 minute'`,
          sql`exists (select 1 from ${savedProducts} where ${savedProducts.trackedProductId} = ${trackedProducts.id}
            and ${savedProducts.trackingStartedAt} > ${trackedProducts.lastSuccessAt})`)),
      or(isNull(trackedProducts.checkLeaseUntil), lte(trackedProducts.checkLeaseUntil, now)),
    )).orderBy(asc(trackedProducts.nextCheckAt), asc(trackedProducts.createdAt)).limit(limit).for('update', { skipLocked: true });
    const claimed = [];
    for (const row of rows) {
      const token = crypto.randomUUID();
      await tx.update(trackedProducts).set({ checkLeaseToken: token,
        checkLeaseUntil: new Date(now.getTime() + CHECK_LEASE_MS), updatedAt: now,
      }).where(eq(trackedProducts.id, row.id));
      claimed.push({ ...row, checkLeaseToken: token });
    }
    return claimed;
  });
}

export async function runPriceTrackingBatch(options: { resolve?: typeof resolveProductPrice; limit?: number } = {}): Promise<PriceTrackingBatchResult> {
  const products = await claimPriceChecks(options.limit ?? 25);
  const stats: PriceTrackingBatchResult = { selected: products.length, success: 0, failed: 0, blocked: 0 };
  const queue = [...products];
  const workers = await Promise.allSettled(Array.from({ length: 2 }, async () => {
    while (queue.length) {
      const product = queue.shift()!;
      const owned = and(eq(trackedProducts.id, product.id), eq(trackedProducts.checkLeaseToken, product.checkLeaseToken));
      const checkedAt = new Date();
      try {
        // Butiğin pazarı (bkz. pazar.ts): istekler pazar çereziyle gider, fiyat pazarın para biriminde beklenir.
        const [butik] = product.boutiqueId ? await db.select({ ulke: boutiques.countryCode }).from(boutiques)
          .where(eq(boutiques.id, product.boutiqueId)).limit(1) : [];
        const ulke = butik?.ulke ?? null;
        const context = { url: product.sourceUrl, domain: product.domain, title: product.title,
          expectedCurrency: pazarParaBirimi(ulke) ?? product.currency, trackedProductId: product.id, boutiqueId: product.boutiqueId };
        const resolve = options.resolve ?? resolveProductPrice;
        let resolution = await (ulke ? pazarBaglami.run({ ulke }, () => resolve(context)) : resolve(context));
        const uyusmazlik = resolution.status === 'success' ? pazarParaUyusmazligi(ulke, resolution.observation.currency) : null;
        if (uyusmazlik) {
          resolution = { status: 'failed', reason: 'price_conflict', error: uyusmazlik, attempts: resolution.attempts };
          // Pazar dışı para biriminde kalmış eski fiyat uygulamada gösterilmesin.
          if (product.currency && pazarParaUyusmazligi(ulke, product.currency))
            await db.update(trackedProducts).set({ currentPriceMinor: null, currency: null, updatedAt: new Date() }).where(owned);
        }
        if (resolution.status === 'success') {
          await recordPriceObservation({ trackedProductId: product.id, checkLeaseToken: product.checkLeaseToken,
            priceMinor: resolution.observation.priceMinor, currency: resolution.observation.currency,
            availability: resolution.observation.availability, observedAt: resolution.observation.observedAt });
          const [restockAlert] = await db.select({ id: savedProducts.id }).from(savedProducts).where(and(
            eq(savedProducts.trackedProductId, product.id), isNotNull(savedProducts.restockAlertAt))).limit(1);
          await db.update(trackedProducts).set({ lastCheckedAt: checkedAt,
            nextCheckAt: nextSuccessCheck(Date.now(), resolution.observation.availability, !!restockAlert),
            checkLeaseToken: null, checkLeaseUntil: null,
          }).where(owned);
          stats.success++;
        } else {
          await db.update(trackedProducts).set({ lastCheckedAt: checkedAt,
            nextCheckAt: nextFailureCheck(Date.now(), product.consecutiveFailures, resolution.reason, retailerFetch.blockedUntil(product.sourceUrl)),
            lastError: `${resolution.reason}: ${resolution.error}`, consecutiveFailures: sql`${trackedProducts.consecutiveFailures} + 1`,
            checkLeaseToken: null, checkLeaseUntil: null, updatedAt: new Date(),
          }).where(owned);
          stats.failed++;
          if (resolution.reason === 'blocked') stats.blocked++;
        }
        logger.info({ trackedProductId: product.id, status: resolution.status, attempts: resolution.attempts }, 'price-tracking: check completed');
      } catch (error) {
        stats.failed++;
        await db.update(trackedProducts).set({ lastCheckedAt: checkedAt,
          nextCheckAt: nextFailureCheck(Date.now(), product.consecutiveFailures, 'provider_error'),
          lastError: `job_error: ${String(error)}`, consecutiveFailures: sql`${trackedProducts.consecutiveFailures} + 1`,
          checkLeaseToken: null, checkLeaseUntil: null, updatedAt: new Date(),
        }).where(owned);
        logger.error({ trackedProductId: product.id, error }, 'price-tracking: check failed');
      }
    }
  }));
  for (const worker of workers) if (worker.status === 'rejected') throw worker.reason;
  logger.info(stats, 'price-tracking: batch completed');
  return stats;
}

async function runGuarded() {
  if (jobRunning) return;
  jobRunning = true;
  try {
    const backfill=await backfillSavedTrackingBatch(backfillCursor);
    backfillCursor=backfill.afterId;
    if(backfill.scanned)logger.info(backfill,'price-tracking: legacy saves linked');
    await runPriceTrackingBatch();
  }
  catch (error) { logger.error({ error }, 'price-tracking: batch failed'); }
  finally { jobRunning = false; }
}

export function startPriceTrackingJob(): void {
  void runGuarded();
  setInterval(() => { void runGuarded(); }, 60_000);
}
