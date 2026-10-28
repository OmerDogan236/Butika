import { expect, test } from 'bun:test';
import type { NewKullaniciProfiliSatiri } from '@butika/db';
import type { ProfilRaporu } from '@butika/types';

// Admin "Kullanıcı Profilleri" raporu: isimsiz liste, özet ve vitrin açmaları.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('profil raporu isimsizdir ve yalnız okur', async () => {
  const url = new URL(testUrl!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/butika_notification_test')
  ) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../../env');
  if (env.DATABASE_URL !== testUrl || env.PROFIL_RAPOR_KIMLIK_GOSTER)
    throw new Error('Database configuration was already loaded; run this test file separately');
  const { db } = await import('../../lib/db');
  const { adminProfillerRoutes } = await import('./profiller');
  const { signAdminAccessToken } = await import('../../lib/jwt');
  const { errorResponse } = await import('../../lib/errors');
  const { Hono } = await import('hono');
  const { inArray } = await import('drizzle-orm');
  const { users, kullaniciProfilleri, events } = await import('@butika/db');
  const app = new Hono().route('/admin/profiller', adminProfillerRoutes);
  app.onError((err, c) => errorResponse(c, err));
  const token = await signAdminAccessToken(crypto.randomUUID());

  const k: string[] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const profil = (userId: string, i: number): NewKullaniciProfiliSatiri => ({
    userId,
    tarz: { minimal: 1 },
    butce: { segmentler: { orta: 1 }, ortanca: { TRY: 100_000 } },
    kategoriler: {},
    urunEtiketleri: { tur: {}, renk: {}, malzeme: {} },
    yasAraligi: '25_34',
    kayitSayisi: i,
    kaynak: 'karisik',
    // Bu testin satırları listenin en başında olsun
    guncellendi: new Date(Date.now() + 60_000 + i * 1000),
  });
  try {
    await db
      .insert(users)
      .values(k.map((id, i) => ({ id, displayName: `Gizli Ad ${i}`, email: `gizli${i}@x.test` })));
    await db.insert(kullaniciProfilleri).values(k.map(profil));
    await db.insert(events).values([
      { userId: k[0], type: 'boutique_view', payload: { kaynak: 'vitrin', siralama: 'kisisel' } },
      { userId: k[1], type: 'boutique_view', payload: { kaynak: 'vitrin', siralama: 'kisisel' } },
    ]);

    const yetkisiz = await app.request('/admin/profiller');
    expect(yetkisiz.status).toBe(401);

    const res = await app.request('/admin/profiller?range=7d', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const govde = await res.text();
    // İsim ve e-posta yanıtta hiç geçmez; tam kimlik de geçmez
    expect(govde).not.toContain('Gizli Ad');
    expect(govde).not.toContain('@x.test');
    for (const id of k) expect(govde).not.toContain(id);

    const r = JSON.parse(govde) as ProfilRaporu;
    expect(r.range).toBe('7d');
    expect(r.anahtarlar.kimlikGoster).toBe(false);
    expect(r.ozet.profil).toBeGreaterThanOrEqual(3);
    expect(r.kullanicilar.satirlar.slice(0, 3).map((s) => s.kisaKimlik)).toEqual(
      [...k].reverse().map((id) => id.slice(0, 8)),
    );
    expect(r.kullanicilar.satirlar[0]).toMatchObject({
      tarzlar: ['minimal'],
      butce: ['orta'],
      ortanca: { TRY: 100_000 },
      kayitSayisi: 2,
    });
    const kisisel = r.oneri.vitrin.find((v) => v.siralama === 'kisisel');
    expect(kisisel?.acma).toBeGreaterThanOrEqual(2);

    const gecersiz = await app.request('/admin/profiller?range=1y', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(gecersiz.status).toBe(400);
  } finally {
    await db.delete(events).where(inArray(events.userId, k));
    await db.delete(users).where(inArray(users.id, k));
  }
});
