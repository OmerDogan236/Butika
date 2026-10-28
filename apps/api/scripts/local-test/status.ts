// LOCAL TEST ONLY. Shows the latest saves with their tracking state, the latest
// push devices and the latest push outbox rows. Prints no push tokens.
// Run from apps/api: bun scripts/local-test/status.ts
import postgres from 'postgres';
import { localTestDatabaseUrl } from './local-db';

const show = (title: string, rows: readonly object[]) => {
  console.log(title);
  if (rows.length) console.table(rows);
  else console.log('  (boş)');
};

let sql: ReturnType<typeof postgres> | undefined;
try {
  sql = postgres(localTestDatabaseUrl(), { max: 1, onnotice: () => {} });
  show('Son kayıtlar', await sql`select sp.title as urun, to_char(sp.created_at, 'DD.MM HH24:MI:SS') as kaydedildi,
      coalesce(tp.tracking_status, 'takip yok') as takip, tp.availability as stok,
      round(tp.current_price_minor / 100.0, 2) as fiyat,
      round(tp.notification_baseline_price_minor / 100.0, 2) as taban, tp.currency as para
    from saved_products sp left join tracked_products tp on tp.id = sp.tracked_product_id
    order by sp.created_at desc limit 5`);
  show('Push cihazları', await sql`select platform, enabled as acik, to_char(created_at, 'DD.MM HH24:MI:SS') as kayit
    from push_devices order by created_at desc limit 3`);
  show('Push kuyruğu', await sql`select status as durum, attempts as deneme, last_error as hata,
      message->>'body' as metin, to_char(created_at, 'DD.MM HH24:MI:SS') as olustu
    from push_outbox order by created_at desc limit 5`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql?.end();
}
