import { expect, test } from 'bun:test';

// POST /gonderimler: bağlı butiklere etiketli "Butikte gör" linki.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)(
  'gönderim: pilot + bağlı butik etiketlenir, diğerleri aynen döner',
  async () => {
    const url = new URL(testUrl!);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !url.pathname.startsWith('/butika_notification_test')
    ) {
      throw new Error('A dedicated local butika_notification_test database is required');
    }
    const pilot = crypto.randomUUID();
    const pilotOlmayan = crypto.randomUUID();
    process.env.DATABASE_URL = testUrl;
    process.env.BAGLANTI_PILOT_KULLANICILARI = pilot;
    const { env } = await import('../env');
    if (env.DATABASE_URL !== testUrl)
      throw new Error('Database configuration was already loaded; run this test file separately');
    const { db } = await import('../lib/db');
    const { gonderimlerRoutes } = await import('./gonderimler');
    const { signAccessToken } = await import('../lib/jwt');
    const { errorResponse } = await import('../lib/errors');
    const { Hono } = await import('hono');
    const { eq, inArray } = await import('drizzle-orm');
    const { users, countries, boutiques, butikBaglantilari, gonderimler } = await import(
      '@butika/db'
    );
    const app = new Hono().route('/gonderimler', gonderimlerRoutes);
    app.onError((err, c) => errorResponse(c, err));

    const bagli = crypto.randomUUID();
    const bagsiz = crypto.randomUUID();
    const kopuk = crypto.randomUUID();
    try {
      await db
        .insert(countries)
        .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
        .onConflictDoNothing();
      await db.insert(users).values([
        { id: pilot, displayName: 'Pilot' },
        { id: pilotOlmayan, displayName: 'Sıradan' },
      ]);
      const butik = (id: string, ad: string) => ({
        id,
        countryCode: 'TR',
        name: ad,
        url: `https://www.${id}.example.com`,
        coverImageUrl: `https://example.com/${id}.jpg`,
      });
      await db
        .insert(boutiques)
        .values([butik(bagli, 'Bağlı'), butik(bagsiz, 'Bağsız'), butik(kopuk, 'Kopuk')]);
      const baglanti = (boutiqueId: string, durum: string) => ({
        boutiqueId,
        platform: 'ikas',
        magazaAdi: 'x',
        kimlikSifreli: 'x',
        durum,
        iletisimEposta: 'a@b.c',
        onaylayanAd: 'A',
        sartlarSurumu: '2026-10-deneme',
        onayAt: new Date(),
      });
      await db
        .insert(butikBaglantilari)
        .values([baglanti(bagli, 'aktif'), baglanti(kopuk, 'koptu')]);

      const gonder = async (userId: string, boutiqueId: string, hedef: string) => {
        const token = await signAccessToken(userId);
        const res = await app.request('/gonderimler', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ boutiqueId, url: hedef }),
        });
        return res;
      };
      const satirlar = (boutiqueId: string) =>
        db.select().from(gonderimler).where(eq(gonderimler.boutiqueId, boutiqueId));

      // Pilot + bağlı butik: etiketli, satır yazılır (www. farkı yok sayılır).
      const hedef = `https://${bagli}.example.com/urun/1?renk=mavi`;
      const res = await gonder(pilot, bagli, hedef);
      expect(res.status).toBe(200);
      const { url: donen } = (await res.json()) as { url: string };
      const u = new URL(donen);
      const [satir] = await satirlar(bagli);
      expect(satir?.userId).toBe(pilot);
      expect(satir?.url).toBe(hedef);
      expect(u.searchParams.get('utm_content')).toBe(satir?.id ?? 'yok');
      expect(u.searchParams.get('utm_source')).toBe('butika');
      expect(u.searchParams.get('renk')).toBe('mavi');

      // Pilot olmayan: aynı URL, satır yok.
      const r2 = await gonder(pilotOlmayan, bagli, hedef);
      expect(((await r2.json()) as { url: string }).url).toBe(hedef);
      expect(await satirlar(bagli)).toHaveLength(1);

      // Bağlı olmayan ve kopuk butik: aynı URL, satır yok.
      for (const id of [bagsiz, kopuk]) {
        const h = `https://${id}.example.com/`;
        const r = await gonder(pilot, id, h);
        expect(((await r.json()) as { url: string }).url).toBe(h);
        expect(await satirlar(id)).toHaveLength(0);
      }

      // Başka alan adı: aynı URL, satır yok.
      const baska = 'https://baska-site.example.org/x';
      const r3 = await gonder(pilot, bagli, baska);
      expect(((await r3.json()) as { url: string }).url).toBe(baska);
      expect(await satirlar(bagli)).toHaveLength(1);

      // Geçersiz url ve giriş yok.
      expect((await gonder(pilot, bagli, 'degil')).status).toBe(400);
      const anonim = await app.request('/gonderimler', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ boutiqueId: bagli, url: hedef }),
      });
      expect(anonim.status).toBe(401);
    } finally {
      await db.delete(users).where(inArray(users.id, [pilot, pilotOlmayan]));
      await db.delete(boutiques).where(inArray(boutiques.id, [bagli, bagsiz, kopuk]));
    }
  },
);
