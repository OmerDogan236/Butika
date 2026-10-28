import { expect, test } from 'bun:test';

// Admin panosu: aralık seçimi ve yayındaki butik sayısı.
// Yalnız ayrı yerel butika_local* veritabanında.
const testUrl = process.env.BUTIKA_DASHBOARD_TEST_URL;

test.skipIf(!testUrl)('pano aralığı ve yayındaki butik sayısı', async () => {
  const url = new URL(testUrl!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/butika_local')
  ) {
    throw new Error('A dedicated local butika_local* database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl)
    throw new Error('Database configuration was already loaded; run this test file separately');
  const { db } = await import('../../lib/db');
  const { adminDashboardRoutes } = await import('./dashboard');
  const { signAdminAccessToken } = await import('../../lib/jwt');
  const { Hono } = await import('hono');
  const { countries, boutiques, users, savedProducts, events } = await import('@butika/db');
  const app = new Hono().route('/admin/dashboard', adminDashboardRoutes);
  const token = await signAdminAccessToken(crypto.randomUUID());
  const pano = async (q = '') =>
    (await (
      await app.request(`/admin/dashboard${q}`, { headers: { Authorization: `Bearer ${token}` } })
    ).json()) as {
      aralik: string;
      totals: { boutiques: number };
      topBoutiques: Array<{ id: string; viewCount: number }>;
      topSavedProducts: Array<{ url: string }>;
    };

  const aktif = crypto.randomUUID();
  const pasif = crypto.randomUUID();
  const kullanici = crypto.randomUUID();
  const ikinci = crypto.randomUUID();
  const ekip = crypto.randomUUID();
  const gunOnce = (g: number) => new Date(Date.now() - g * 24 * 60 * 60 * 1000);

  await db
    .insert(countries)
    .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
    .onConflictDoNothing();
  await db.insert(boutiques).values([
    {
      id: aktif,
      countryCode: 'TR',
      name: 'aktif',
      url: `https://example.com/${aktif}`,
      coverImageUrl: '',
    },
    {
      id: pasif,
      countryCode: 'TR',
      name: 'pasif',
      url: `https://example.com/${pasif}`,
      coverImageUrl: '',
      isActive: false,
    },
  ]);
  await db.insert(users).values([
    { id: kullanici, email: `${kullanici}@example.com`, displayName: 'Deneme' },
    { id: ikinci, email: `${ikinci}@example.com`, displayName: 'İkinci' },
    { id: ekip, email: 'Dev@Butika.local', displayName: 'Ekip' },
  ]);
  // Ekip hesabının bakışı ve kaydı panoya girmemeli.
  await db.insert(events).values({
    type: 'boutique_view',
    userId: ekip,
    payload: { boutiqueId: aktif },
    createdAt: gunOnce(0),
  });
  await db.insert(savedProducts).values({
    userId: ekip,
    boutiqueId: aktif,
    url: `https://example.com/ekip-${ekip}`,
    title: 'ekip',
    createdAt: gunOnce(0),
  });
  // Pano olay değil kişi sayar: "Siteye git" aynı anda boutique_view + webview_open
  // yazar, aynı kişi tekrar açabilir.
  await db.insert(events).values([
    {
      type: 'boutique_view',
      userId: kullanici,
      payload: { boutiqueId: aktif },
      createdAt: gunOnce(0),
    },
    {
      type: 'webview_open',
      userId: kullanici,
      payload: { boutiqueId: aktif },
      createdAt: gunOnce(0),
    },
    {
      type: 'webview_open',
      userId: ikinci,
      payload: { boutiqueId: aktif },
      createdAt: gunOnce(10),
    },
    {
      type: 'webview_open',
      userId: kullanici,
      payload: { boutiqueId: aktif },
      createdAt: gunOnce(3),
    },
    {
      type: 'webview_open',
      userId: kullanici,
      payload: { boutiqueId: aktif },
      createdAt: gunOnce(20),
    },
  ]);
  await db.insert(savedProducts).values([
    {
      userId: kullanici,
      boutiqueId: aktif,
      url: 'https://example.com/eski',
      title: 'eski',
      createdAt: gunOnce(2),
    },
    {
      userId: kullanici,
      boutiqueId: aktif,
      url: 'https://example.com/yeni',
      title: 'yeni',
      createdAt: gunOnce(0),
    },
  ]);

  const varsayilan = await pano();
  expect(varsayilan.aralik).toBe('30g');
  expect(varsayilan.totals.boutiques).toBe(1);
  // 30 gün: iki kişi (ekip hariç); 7 gün ve 24 saat: yalnız ilk kullanıcı, 3 ve 2 olayına rağmen 1.
  expect(varsayilan.topBoutiques.find((b) => b.id === aktif)?.viewCount).toBe(2);
  expect((await pano('?aralik=7g')).topBoutiques.find((b) => b.id === aktif)?.viewCount).toBe(1);
  expect((await pano('?aralik=24s')).topBoutiques.find((b) => b.id === aktif)?.viewCount).toBe(1);
  expect((await pano('?aralik=bozuk')).aralik).toBe('30g');
  expect(varsayilan.topSavedProducts.some((p) => p.url.includes(ekip))).toBe(false);
});
