// LOCAL TEST ONLY. Records a synthetic in-stock price drop (10%) for the most
// recently saved product through the scheduler's own path: price history, drop
// event, in-app notification and push outbox. The running API sends the push.
// Run from apps/api: bun scripts/local-test/simulate-price-drop.ts
import postgres from 'postgres';
import { localTestDatabaseUrl } from './local-db';

let sql: ReturnType<typeof postgres> | undefined;
try {
  sql = postgres(localTestDatabaseUrl(), { max: 1, onnotice: () => {} });
  const { recordPriceObservation } = await import('../../src/lib/price-tracking/record-price-observation');
  const [row] = await sql`select sp.title, sp.user_id, sp.tracking_started_at, tp.id, tp.currency, tp.availability,
      tp.notification_baseline_price_minor as baseline, tp.notification_baseline_at as baseline_at
    from saved_products sp join tracked_products tp on tp.id = sp.tracked_product_id
    order by sp.created_at desc limit 1`;
  if (!row) throw new Error('Takip edilen kayıtlı ürün yok. Uygulamada bir butik ürününü kaydedin.');
  if (row.availability !== 'in_stock' || !row.baseline) {
    throw new Error(`Sunucu bu ürünün stoklu fiyatını henüz doğrulamadı (stok: ${row.availability}). API çalışırken 1-2 dakika bekleyip tekrar deneyin.`);
  }
  const notificationCount = async () => {
    const [result] = await sql!`select count(*)::int as n from notifications n
      join price_drop_events e on e.id = n.price_drop_event_id
      where e.tracked_product_id = ${row.id} and n.user_id = ${row.user_id}`;
    return result!.n as number;
  };
  const before = await notificationCount();
  const now = Date.now();
  // A watcher is only notified about drops from a price observed after they
  // saved. After a re-save, observe the current price again first.
  if (row.tracking_started_at > row.baseline_at) {
    await recordPriceObservation({ trackedProductId: row.id, priceMinor: row.baseline, currency: row.currency, availability: 'in_stock', observedAt: new Date(now) });
  }
  const priceMinor = row.baseline - Math.max(100, Math.round(row.baseline * 0.1));
  await recordPriceObservation({ trackedProductId: row.id, priceMinor, currency: row.currency, availability: 'in_stock', observedAt: new Date(now + 1000) });
  const created = (await notificationCount()) - before;
  console.log(`${row.title}: ${(row.baseline / 100).toFixed(2)} -> ${(priceMinor / 100).toFixed(2)} ${row.currency}`);
  console.log(created > 0
    ? "Bildirim oluştu. Çalışan API push'u birkaç saniye içinde gönderir."
    : 'Bildirim oluşmadı. TEST-REHBERI.md içindeki "Sorun giderme" bölümüne bakın.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql?.end();
}
// The API's database pool keeps the process alive after recordPriceObservation.
process.exit(process.exitCode ?? 0);
