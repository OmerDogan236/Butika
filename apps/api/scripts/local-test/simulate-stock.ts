// LOCAL TEST ONLY. Records a stock observation for the most recently saved
// product at its current price: "out" (sold out) or "in" (back in stock). With
// a stock alert armed, "in" creates the "Stoğa geldi" notification; the running
// API sends the push.
// Run from apps/api: bun scripts/local-test/simulate-stock.ts out|in
import postgres from 'postgres';
import { localTestDatabaseUrl } from './local-db';

const mode = process.argv[2];
let sql: ReturnType<typeof postgres> | undefined;
try {
  if (mode !== 'out' && mode !== 'in') throw new Error('Kullanım: bun scripts/local-test/simulate-stock.ts out|in');
  sql = postgres(localTestDatabaseUrl(), { max: 1, onnotice: () => {} });
  const { recordPriceObservation } = await import('../../src/lib/price-tracking/record-price-observation');
  const [row] = await sql`select sp.title, sp.user_id, tp.id, tp.current_price_minor as price, tp.currency
    from saved_products sp join tracked_products tp on tp.id = sp.tracked_product_id
    order by sp.created_at desc limit 1`;
  if (!row) throw new Error('Takip edilen kayıtlı ürün yok. Uygulamada bir butik ürününü kaydedin.');
  if (!row.price || !row.currency) {
    throw new Error('Sunucu bu ürünün fiyatını henüz okumadı. API çalışırken 1-2 dakika bekleyip tekrar deneyin.');
  }
  const restockCount = async () => {
    const [result] = await sql!`select count(*)::int as n from notifications
      where type = 'back_in_stock' and user_id = ${row.user_id}`;
    return result!.n as number;
  };
  const before = await restockCount();
  await recordPriceObservation({ trackedProductId: row.id, priceMinor: row.price, currency: row.currency,
    availability: mode === 'out' ? 'out_of_stock' : 'in_stock', observedAt: new Date() });
  if (mode === 'out') {
    console.log(`${row.title}: tükendi olarak işaretlendi. Kaydedilenler'i yenileyip "Stok gelince haber ver"e dokunabilirsiniz.`);
  } else {
    console.log(`${row.title}: tekrar stokta.`);
    console.log((await restockCount()) > before
      ? "Stok bildirimi oluştu. Çalışan API push'u birkaç saniye içinde gönderir."
      : 'Stok bildirimi oluşmadı: bu ürün için kurulu bir stok alarmı yoktu.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql?.end();
}
// The API's database pool keeps the process alive after recordPriceObservation.
process.exit(process.exitCode ?? 0);
