import { notifications, priceDropEvents, pushDevices, pushOutbox, restockEvents, savedProducts, trackedProducts, users } from '@butika/db';
import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { captureServerEvent } from '../analytics';
import { env } from '../../env';
import { db } from '../db';
import { logger } from '../logger';
import { readExpoReceipt, sendExpoMessage, type ExpoResult } from './expo-transport';

const MAX_ATTEMPTS = 6;
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
type Job = typeof pushOutbox.$inferSelect;

async function claim(): Promise<Job | null> {
  return db.transaction(async tx => {
    const now = new Date();
    const [row] = await tx.select().from(pushOutbox).where(and(
      inArray(pushOutbox.status, ['pending', 'awaiting_receipt']), lte(pushOutbox.nextAttemptAt, now),
      or(isNull(pushOutbox.lockedUntil), lte(pushOutbox.lockedUntil, now)),
    )).orderBy(asc(pushOutbox.nextAttemptAt)).limit(1).for('update', { skipLocked: true });
    if (!row) return null;
    const [job] = await tx.update(pushOutbox).set({ leaseToken: crypto.randomUUID(),
      lockedUntil: new Date(now.getTime() + 60000), updatedAt: now,
      ...(row.status === 'pending' ? { attempts: row.attempts + 1 } : { receiptAttempts: row.receiptAttempts + 1 }),
    }).where(eq(pushOutbox.id, row.id)).returning();
    return job ?? null;
  });
}

const owned = (job: Job) => and(eq(pushOutbox.id, job.id), eq(pushOutbox.leaseToken, job.leaseToken!));

// Kuyruk durumu → PostHog olayı. Geçici hatalar ('pending'e dönen yeniden
// denemeler) olay üretmez; yalnız kalıcı sonuçlar sayılır.
const OUTCOME_EVENTS: Record<string, string> = {
  awaiting_receipt: 'push_sent',
  delivered: 'push_delivered',
  failed: 'push_failed',
  cancelled: 'push_cancelled',
};

async function trackOutcome(job: Job, status: string, code: string | null | undefined) {
  const event = OUTCOME_EVENTS[status];
  if (!event) return;
  try {
    const [notification] = await db.select({ userId: notifications.userId }).from(notifications)
      .where(eq(notifications.id, job.notificationId));
    if (!notification) return;
    const data = job.message.data as Record<string, unknown> | undefined;
    captureServerEvent(notification.userId, event, {
      notification_type: typeof data?.type === 'string' ? data.type : null,
      event_id: typeof data?.eventId === 'string' ? data.eventId : null,
      attempts: job.attempts,
      ...(event === 'push_failed' || event === 'push_cancelled' ? { error_code: code ?? null } : {}),
    });
  } catch {
    // analitik best-effort — kuyruğu asla bozmamalı
  }
}

async function finish(job: Job, values: Partial<typeof pushOutbox.$inferInsert>, disableToken = false) {
  let changedAny = false;
  await db.transaction(async tx => {
    const changed = await tx.update(pushOutbox).set({ ...values, leaseToken: null, lockedUntil: null, updatedAt: new Date() })
      .where(owned(job)).returning({ id: pushOutbox.id });
    changedAny = changed.length > 0;
    if (changed.length && values.status === 'failed') logger.warn({ outboxId: job.id, code: values.lastError }, 'push outbox permanently failed');
    if (changed.length && disableToken) {
      const [notification] = await tx.select().from(notifications).where(eq(notifications.id, job.notificationId));
      if (notification) await tx.update(pushDevices).set({ enabled: false, updatedAt: new Date() }).where(and(
        eq(pushDevices.id, job.deviceId), eq(pushDevices.expoPushToken, job.token), eq(pushDevices.userId, notification.userId),
      ));
    }
  });
  if (changedAny && values.status) await trackOutcome(job, values.status, values.lastError);
}

async function stillEligible(job: Job): Promise<boolean> {
  // A notification points at either a price drop or a return to stock; the
  // pushed price must still be the current, in-stock one in both cases.
  const [row] = await db.select({ id: pushDevices.id }).from(pushDevices)
    .innerJoin(notifications, eq(notifications.id, job.notificationId))
    .innerJoin(users, eq(users.id, notifications.userId))
    .leftJoin(priceDropEvents, eq(priceDropEvents.id, notifications.priceDropEventId))
    .leftJoin(restockEvents, eq(restockEvents.id, notifications.restockEventId))
    .innerJoin(trackedProducts, eq(trackedProducts.id, sql`coalesce(${priceDropEvents.trackedProductId}, ${restockEvents.trackedProductId})`))
    .where(and(eq(pushDevices.id, job.deviceId), eq(pushDevices.expoPushToken, job.token),
      eq(pushDevices.userId, notifications.userId), eq(pushDevices.enabled, true),
      // A deleted account (awaiting the 30-day purge) receives no further pushes.
      isNull(users.deletedAt),
      // The shared store-review account keeps its in-app notifications but never
      // gets a push, whatever REVIEW_AUTH_ENABLED says: its devices belong to
      // whoever used the review sign-in. Checked here, so queued jobs stop too.
      sql`${users.email} is distinct from ${env.REVIEW_AUTH_EMAIL}`,
      eq(trackedProducts.trackingStatus, 'active'), eq(trackedProducts.availability, 'in_stock'),
      eq(trackedProducts.currency, sql`coalesce(${priceDropEvents.currency}, ${restockEvents.currency})`),
      eq(trackedProducts.currentPriceMinor, sql`coalesce(${priceDropEvents.newPriceMinor}, ${restockEvents.priceMinor})`),
      // A later price-check failure or an old observation is not current stock proof.
      eq(trackedProducts.consecutiveFailures, 0),
      sql`${trackedProducts.lastSuccessAt} >= now() - interval '24 hours'`,
      // The user must still have this product saved (for a price drop: since before it).
      sql`exists (select 1 from ${savedProducts} where ${savedProducts.userId} = ${notifications.userId}
        and ${savedProducts.trackedProductId} = ${trackedProducts.id}
        and (${notifications.restockEventId} is not null or ${savedProducts.trackingStartedAt} <= ${priceDropEvents.detectedAt}))`,
    )).limit(1);
  return !!row;
}

async function handleSend(job: Job) {
  if (job.attempts > MAX_ATTEMPTS) return finish(job, { status: 'failed', lastError: 'SendAttemptsExhausted' });
  if (!await stillEligible(job)) return finish(job, { status: 'cancelled', lastError: 'NoLongerEligible' });
  const result = await sendExpoMessage(job.token, job.message);
  if (result.status === 'ok' && result.id) return finish(job, { status: 'awaiting_receipt', ticketId: result.id,
    acceptedAt: new Date(), nextAttemptAt: new Date(Date.now() + RECEIPT_DELAY_MS), lastError: null });
  const error = result.status === 'error' ? result : { status: 'error', code: 'MissingTicket', retryable: true } as const;
  const retry = error.retryable && job.attempts < MAX_ATTEMPTS;
  const delay = Math.min(60 * 60 * 1000, 30000 * 2 ** (job.attempts - 1)) + Math.floor(Math.random() * 5000);
  await finish(job, { status: retry ? 'pending' : 'failed', lastError: error.code,
    nextAttemptAt: new Date(Date.now() + delay) }, error.code === 'DeviceNotRegistered');
}

async function handleReceipt(job: Job) {
  if (!job.ticketId) return finish(job, { status: 'failed', lastError: 'MissingStoredTicket' });
  const result: ExpoResult = await readExpoReceipt(job.ticketId);
  if (result.status === 'ok') return finish(job, { status: 'delivered', lastError: null });
  // A received error is an actual provider rejection; only transient rejections
  // may resend. A missing receipt/network failure only polls the same ticket.
  if (result.status === 'error' && !['NetworkOrInvalidJSON', 'MalformedReceiptResponse', 'MalformedResponse'].includes(result.code) && !result.code.startsWith('HTTP_')) {
    const retry = result.retryable && job.attempts < MAX_ATTEMPTS;
    return finish(job, { status: retry ? 'pending' : 'failed', lastError: result.code,
      nextAttemptAt: new Date(Date.now() + RECEIPT_DELAY_MS), ticketId: null }, result.code === 'DeviceNotRegistered');
  }
  await finish(job, { nextAttemptAt: new Date(Date.now() + RECEIPT_DELAY_MS),
    lastError: result.status === 'missing' ? 'ReceiptNotReady' : result.status === 'error' ? result.code : 'InvalidReceipt' });
}

export async function runPushOutboxBatch(limit = 20): Promise<number> {
  let processed = 0;
  for (; processed < limit; processed++) {
    const job = await claim();
    if (!job) break;
    try {
      if (job.expiresAt <= new Date()) await finish(job, { status: 'failed', lastError: job.ticketId ? 'ReceiptOutcomeUnknown' : 'Expired' });
      else if (job.status === 'pending') await handleSend(job);
      else await handleReceipt(job);
    } catch {
      // Leave the lease to expire. Never log stored tokens or message content.
      logger.error({ outboxId: job.id }, 'push outbox processing failed; lease will expire');
    }
  }
  return processed;
}

let started = false, running = false;
export function startPushOutboxJob(): void {
  if (started) return;
  started = true;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runPushOutboxBatch(); } catch { logger.error('push outbox batch failed'); }
    finally { running = false; }
  };
  void tick();
  setInterval(() => { void tick(); }, 15000).unref();
}
