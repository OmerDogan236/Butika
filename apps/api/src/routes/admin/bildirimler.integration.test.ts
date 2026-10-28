import { expect, test } from 'bun:test';

// Admin "Bildirimler": plan oluşturma/onay/iptal kuralları ve zamanı gelen planın
// gönderilmesi. Expo'ya giden istekler yakalanır, hiçbir şey gönderilmez.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('bildirim planı: onay, iptal, zamanında gönderim, gecikme', async () => {
  const url = new URL(testUrl!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/butika_notification_test')
  ) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl)
    throw new Error('Database configuration was already loaded; run this test file separately');
  const { db } = await import('../../lib/db');
  const { adminBildirimlerRoutes } = await import('./bildirimler');
  const { runBildirimPlaniBatch } = await import('../../lib/push/bildirim-plani-worker');
  const { signAdminAccessToken } = await import('../../lib/jwt');
  const { errorResponse } = await import('../../lib/errors');
  const { Hono } = await import('hono');
  const { eq, inArray } = await import('drizzle-orm');
  const { users, pushDevices, bildirimPlanlari } = await import('@butika/db');
  const app = new Hono().route('/admin/bildirimler', adminBildirimlerRoutes);
  app.onError((err, c) => errorResponse(c, err));

  // Expo tuzağı: her gönderime "ok" bileti döner, gövdeler kaydedilir.
  const gidenler: { to: string; title: string; data: { campaign: string; target?: string } }[] = [];
  const asilFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const adres = String(input);
    if (!adres.startsWith('https://exp.host/')) throw new Error(`beklenmeyen istek: ${adres}`);
    const [mesaj] = JSON.parse(String(init?.body));
    gidenler.push(mesaj);
    return new Response(JSON.stringify({ data: [{ status: 'ok', id: crypto.randomUUID() }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const kullanici = crypto.randomUUID();
  const planIdleri: string[] = [];
  try {
    await db.insert(users).values({
      id: kullanici,
      email: `bildirim-${kullanici}@example.com`,
      displayName: 'Bildirim',
    });
    await db.insert(pushDevices).values({
      userId: kullanici,
      installationId: `bildirim-${kullanici}`,
      expoPushToken: `ExponentPushToken[bildirim-${kullanici}]`,
      platform: 'ios',
    });

    const token = await signAdminAccessToken(crypto.randomUUID());
    const istek = (yol: string, method: string, body?: unknown) =>
      app.request(`/admin/bildirimler${yol}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const ileri = (dk: number) => new Date(Date.now() + dk * 60_000).toISOString();

    // Geçmiş zamana plan açılmaz; çok uzun başlık reddedilir.
    expect(
      (await istek('', 'POST', { baslik: 'a', metin: 'b', gonderimZamani: ileri(-5) })).status,
    ).toBe(400);
    expect(
      (await istek('', 'POST', { baslik: 'x'.repeat(61), metin: 'b', gonderimZamani: ileri(10) }))
        .status,
    ).toBe(400);

    // Hedef: bilinmeyen değer ve olmayan butik/kategori reddedilir.
    for (const hedef of ['magaza', 'butik:x', `kategori:${crypto.randomUUID()}`]) {
      expect(
        (await istek('', 'POST', { baslik: 'a', metin: 'b', gonderimZamani: ileri(10), hedef }))
          .status,
      ).toBe(400);
    }

    // Taslak varsayılan; onaylanınca planlandi. Dokununca Fırsat açılır.
    const r1 = await istek('', 'POST', {
      baslik: 'Sonbahar',
      metin: 'Seçki vitrinde',
      gonderimZamani: ileri(10),
      hedef: 'firsat',
    });
    expect(r1.status).toBe(201);
    const taslak = await r1.json();
    planIdleri.push(taslak.id);
    expect(taslak.durum).toBe('taslak');
    expect(taslak.kampanya).toBe(`admin-${taslak.id.slice(0, 8)}`);
    expect(taslak.hedef).toBe('firsat');
    const onay = await (await istek(`/${taslak.id}`, 'PATCH', { durum: 'planlandi' })).json();
    expect(onay.durum).toBe('planlandi');

    // İptal edilen plan bir daha değiştirilemez. Hedefsiz plan yalnız uygulamayı açar.
    const r2 = await (
      await istek('', 'POST', {
        baslik: 'İptal',
        metin: 'x',
        gonderimZamani: ileri(10),
        durum: 'planlandi',
      })
    ).json();
    planIdleri.push(r2.id);
    expect(r2.hedef).toBeNull();
    expect((await (await istek(`/${r2.id}`, 'PATCH', { hedef: 'vitrin' })).json()).hedef).toBe(
      'vitrin',
    );
    expect((await (await istek(`/${r2.id}`, 'PATCH', { durum: 'iptal' })).json()).durum).toBe(
      'iptal',
    );
    expect((await istek(`/${r2.id}`, 'PATCH', { durum: 'planlandi' })).status).toBe(400);

    // Zamanı gelmemiş plan gönderilmez.
    await runBildirimPlaniBatch();
    expect(gidenler.filter((g) => g.title === 'Sonbahar')).toHaveLength(0);

    // Zamanı geldi (2 dk önce) → gönderilir; 2 saat önceki → gecikti, gönderilmez.
    await db
      .update(bildirimPlanlari)
      .set({ gonderimZamani: new Date(Date.now() - 2 * 60_000) })
      .where(eq(bildirimPlanlari.id, taslak.id));
    const [gec] = await db
      .insert(bildirimPlanlari)
      .values({
        baslik: 'Geç',
        metin: 'x',
        durum: 'planlandi',
        gonderimZamani: new Date(Date.now() - 2 * 3600_000),
      })
      .returning();
    planIdleri.push(gec!.id);
    await runBildirimPlaniBatch();

    const bize = gidenler.filter((g) => g.to === `ExponentPushToken[bildirim-${kullanici}]`);
    expect(bize.map((g) => g.title)).toEqual(['Sonbahar']);
    expect(bize[0]!.data.campaign).toBe(taslak.kampanya);
    expect(bize[0]!.data.target).toBe('firsat');

    const liste = await (await istek('', 'GET')).json();
    const gonderilen = liste.find((p: { id: string }) => p.id === taslak.id);
    expect(gonderilen.durum).toBe('gonderildi');
    expect(gonderilen.basarili).toBeGreaterThanOrEqual(1);
    expect(gonderilen.hatali).toBe(0);
    expect(gonderilen.gonderildiAt).not.toBeNull();
    expect(liste.find((p: { id: string }) => p.id === gec!.id).durum).toBe('gecikti');

    // Gönderilmiş plan değiştirilemez; ikinci tur aynı planı tekrar göndermez.
    expect((await istek(`/${taslak.id}`, 'PATCH', { metin: 'yeni' })).status).toBe(400);
    await runBildirimPlaniBatch();
    expect(gidenler.filter((g) => g.title === 'Sonbahar')).toHaveLength(bize.length);

    const kitle = await (await istek('/kitle', 'GET')).json();
    expect(kitle.all.kisi).toBeGreaterThanOrEqual(1);
  } finally {
    globalThis.fetch = asilFetch;
    if (planIdleri.length)
      await db.delete(bildirimPlanlari).where(inArray(bildirimPlanlari.id, planIdleri));
    await db.delete(users).where(eq(users.id, kullanici));
  }
});
