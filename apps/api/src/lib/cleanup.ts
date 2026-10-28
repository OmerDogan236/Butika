import { users } from '@butika/db';
import { and, isNotNull, lt } from 'drizzle-orm';
import { db } from './db';
import { logger } from './logger';

// KVKK: hesap silindiğinde (soft delete) 30 gün beklenir, sonra kalıcı silinir.
// Kullanıcı silinince FK cascade ile içeriği (yorum, kayıt, koleksiyon vb.) de gider.
// Rıza kayıtları (consent_records) FK'sizdir → yasal ispat defteri olarak KALIR.
const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function purgeDeletedUsers(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS);
  const deleted = await db
    .delete(users)
    .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoff)))
    .returning({ id: users.id });
  if (deleted.length > 0) {
    logger.info({ count: deleted.length }, 'kvkk: 30 günden eski silinen hesaplar kalıcı silindi');
  }
  return deleted.length;
}

// Başlangıçta bir kez + her 24 saatte bir çalıştırır (tek instance için yeterli).
export function startCleanupJob(): void {
  const run = () =>
    purgeDeletedUsers().catch((err) => logger.error({ err }, 'kvkk purge job failed'));
  run();
  setInterval(run, DAY_MS);
}
