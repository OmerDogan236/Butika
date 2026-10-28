import { expect, test } from 'bun:test';
import type { NewKullaniciProfiliSatiri } from '@butika/db';
import type { ProfilDurumu } from '@butika/types';

// GET /me/profil-durumu → { dolu }. Mobil "Sana özel" seçeneğini test yoksa da bununla açar.
// Anahtar durumu dışarıdan verilir; dosyayı tek başına çalıştırın:
//   PROFIL_VITRIN_ENABLED=true  → dolu profil true
//   PROFIL_VITRIN_ENABLED unset → her zaman false
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)('profil durumu: dolu / boş / yok ve anahtar', async () => {
  const url = new URL(testUrl!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/butika_notification_test')
  ) {
    throw new Error('A dedicated local butika_notification_test database is required');
  }
  process.env.DATABASE_URL = testUrl;
  const { env } = await import('../env');
  if (env.DATABASE_URL !== testUrl)
    throw new Error('Database configuration was already loaded; run this test file separately');
  const acik = env.PROFIL_VITRIN_ENABLED;
  const { db } = await import('../lib/db');
  const { meRoutes } = await import('./me');
  const { signAccessToken } = await import('../lib/jwt');
  const { errorResponse } = await import('../lib/errors');
  const { Hono } = await import('hono');
  const { inArray } = await import('drizzle-orm');
  const { users, kullaniciProfilleri } = await import('@butika/db');
  const app = new Hono().route('/me', meRoutes);
  app.onError((err, c) => errorResponse(c, err));

  const k = { davranis: crypto.randomUUID(), bos: crypto.randomUUID(), yok: crypto.randomUUID() };
  const profil = (userId: string, kaynak: 'davranis' | 'bos'): NewKullaniciProfiliSatiri => ({
    userId,
    tarz: kaynak === 'bos' ? {} : { bohem: 1 },
    butce: { segmentler: {}, ortanca: {} },
    kategoriler: {},
    urunEtiketleri: { tur: {}, renk: {}, malzeme: {} },
    yasAraligi: null,
    kayitSayisi: 3,
    kaynak,
    guncellendi: new Date(),
  });
  try {
    await db.insert(users).values(Object.values(k).map((id) => ({ id, displayName: 'Durum' })));
    await db
      .insert(kullaniciProfilleri)
      .values([profil(k.davranis, 'davranis'), profil(k.bos, 'bos')]);
    const durum = async (userId: string) => {
      const res = await app.request('/me/profil-durumu', {
        headers: { authorization: `Bearer ${await signAccessToken(userId)}` },
      });
      expect(res.status).toBe(200);
      return (await res.json()) as ProfilDurumu;
    };
    expect(await durum(k.davranis)).toEqual({ dolu: acik });
    expect(await durum(k.bos)).toEqual({ dolu: false });
    expect(await durum(k.yok)).toEqual({ dolu: false });
    expect((await app.request('/me/profil-durumu')).status).toBe(401);
  } finally {
    await db.delete(users).where(inArray(users.id, Object.values(k)));
  }
});
