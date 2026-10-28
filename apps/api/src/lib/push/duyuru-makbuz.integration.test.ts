import { expect, test } from 'bun:test';

// Duyuru makbuzları: Expo taklit edilir, dışarı push gitmez. Gönderimde (ticket) ya da
// makbuzda DeviceNotRegistered gelen cihazın token'ı kapanır; diğerleri açık kalır.
// Ayrı, yerel ve adı butika_notification_test ile başlayan bir veritabanında, tek başına
// çalıştırın (docs/bildirim-sistemi.md, "Test"). Dosya kendi satırlarını siler.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('duyuru: silinmiş uygulamanın token’ı kapanır, makbuzlar sayılır', async () => {
  const url = new URL(testUrl!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/butika_notification_test')) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl) {
    throw new Error('Database configuration was already loaded; run this test file separately');
  }
  const { db } = await import('../db');
  const { eq, inArray } = await import('drizzle-orm');
  const { users, pushDevices } = await import('@butika/db');
  const { duyuruGonder, duyuruMakbuzlariniIsle } = await import('./duyuru');

  const run = crypto.randomUUID().slice(0, 8);
  const userId = crypto.randomUUID();
  const tok = (ad: string) => `ExponentPushToken[duyuru-${run}-${ad}]`;
  const cihazlar = ['saglam', 'silinmis-gonderim', 'silinmis-makbuz'].map((ad) => ({
    userId,
    token: tok(ad),
    platform: 'ios',
  }));

  await db.insert(users).values({ id: userId, email: `duyuru-${run}@example.invalid`, displayName: 'Duyuru' });
  await db.insert(pushDevices).values(cihazlar.map((c) => ({ userId, installationId: `kurulum-${c.token}`, expoPushToken: c.token, platform: 'ios' as const, enabled: true })));

  const realFetch = globalThis.fetch;
  try {
    // Gönderim: biri ticket aşamasında DeviceNotRegistered, ikisi kabul.
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const [m] = JSON.parse(String(init?.body)) as { to: string }[];
      const data = m!.to === tok('silinmis-gonderim')
        ? [{ status: 'error', details: { error: 'DeviceNotRegistered' } }]
        : [{ status: 'ok', id: `ticket-${m!.to}` }];
      return Response.json({ data });
    }) as unknown as typeof fetch;
    const sonuc = await duyuruGonder(cihazlar, { title: 't', body: 'b', campaign: `test-${run}` });
    expect(sonuc).toEqual({ ok: 2, errors: { DeviceNotRegistered: 1 } });

    // Makbuz: biri teslim, biri DeviceNotRegistered, biri okunamadı (yanıtta yok).
    const makbuz = await duyuruMakbuzlariniIsle(
      [
        { cihaz: cihazlar[0]!, ticketId: 'a' },
        { cihaz: cihazlar[2]!, ticketId: 'b' },
        { cihaz: cihazlar[0]!, ticketId: 'c' },
      ],
      { campaign: `test-${run}` },
      async () => new Map([
        ['a', { status: 'ok' as const }],
        ['b', { status: 'error' as const, code: 'DeviceNotRegistered', retryable: false }],
      ]),
    );
    expect(makbuz).toEqual({ teslim: 1, hata: 1, okunamayan: 1 });

    const rows = await db.select({ token: pushDevices.expoPushToken, enabled: pushDevices.enabled })
      .from(pushDevices).where(eq(pushDevices.userId, userId));
    const durum = Object.fromEntries(rows.map((r) => [r.token, r.enabled]));
    expect(durum).toEqual({
      [tok('saglam')]: true,
      [tok('silinmis-gonderim')]: false,
      [tok('silinmis-makbuz')]: false,
    });
  } finally {
    globalThis.fetch = realFetch;
    await db.delete(pushDevices).where(inArray(pushDevices.expoPushToken, cihazlar.map((c) => c.token)));
    await db.delete(users).where(eq(users.id, userId));
  }
});
