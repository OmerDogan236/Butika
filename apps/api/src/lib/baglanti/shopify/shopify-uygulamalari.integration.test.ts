import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';

// Shopify uygulama anahtarları (şifreli). Yalnız yerel butika_notification_test
// veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('shopify uygulamasi: kaydet, oku, upsert, sifreli saklama', async () => {
  const url = new URL(testUrl!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/butika_notification_test')
  ) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const ANAHTAR = randomBytes(32).toString('base64');
  process.env.BAGLANTI_SIFRELEME_ANAHTARI = ANAHTAR;
  const { env } = await import('../../../env');
  if (env.DATABASE_URL !== testUrl || env.BAGLANTI_SIFRELEME_ANAHTARI !== ANAHTAR)
    throw new Error('Configuration was already loaded; run this test file separately');
  const { db } = await import('../../db');
  const { shopifyUygulamalari } = await import('@butika/db');
  const { eq } = await import('drizzle-orm');
  const { shopifyUygulamasi, shopifyUygulamasiKaydet } = await import('./shopify-uygulamalari');

  const magaza = 'butika-test-uyg.myshopify.com';
  await db.delete(shopifyUygulamalari).where(eq(shopifyUygulamalari.magaza, magaza));
  try {
    expect(await shopifyUygulamasi(magaza)).toBeNull();

    await shopifyUygulamasiKaydet(magaza, 'cid-1', 'duz-secret-1');
    expect(await shopifyUygulamasi(magaza)).toEqual({ clientId: 'cid-1', secret: 'duz-secret-1' });

    const [satir] = await db
      .select()
      .from(shopifyUygulamalari)
      .where(eq(shopifyUygulamalari.magaza, magaza));
    expect(satir!.secretSifreli).not.toContain('duz-secret-1');
    expect(satir!.secretSifreli.startsWith('v1.')).toBe(true);

    await shopifyUygulamasiKaydet(magaza, 'cid-2', 'duz-secret-2');
    expect(await shopifyUygulamasi(magaza)).toEqual({ clientId: 'cid-2', secret: 'duz-secret-2' });
    const sayi = await db
      .select()
      .from(shopifyUygulamalari)
      .where(eq(shopifyUygulamalari.magaza, magaza));
    expect(sayi.length).toBe(1);
  } finally {
    await db.delete(shopifyUygulamalari).where(eq(shopifyUygulamalari.magaza, magaza));
  }
});
