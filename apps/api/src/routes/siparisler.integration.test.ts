import { expect, test } from 'bun:test';
import type { SiparisSatiri } from '@butika/db';

// GET /siparisler: kullanıcının bağlı butik siparişleri ("Satın Aldıklarım").
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek başına çalıştırın.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)(
  'siparisler: pilot kendi siparişlerini görür, görsel/link ve iade politikası dolar',
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
    const baskasi = crypto.randomUUID();
    process.env.DATABASE_URL = testUrl;
    process.env.BAGLANTI_PILOT_KULLANICILARI = `${pilot},${baskasi}`;
    const { env } = await import('../env');
    if (env.DATABASE_URL !== testUrl)
      throw new Error('Database configuration was already loaded; run this test file separately');
    const { db } = await import('../lib/db');
    const { siparislerRoutes } = await import('./siparisler');
    const { signAccessToken } = await import('../lib/jwt');
    const { errorResponse } = await import('../lib/errors');
    const { Hono } = await import('hono');
    const { inArray } = await import('drizzle-orm');
    const { siparislerYanitiSchema } = await import('@butika/types');
    const { users, countries, boutiques, butikBaglantilari, baglantiUrunleri, butikSiparisleri } =
      await import('@butika/db');
    const app = new Hono().route('/siparisler', siparislerRoutes);
    app.onError((err, c) => errorResponse(c, err));

    const butikId = crypto.randomUUID();
    try {
      await db
        .insert(countries)
        .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
        .onConflictDoNothing();
      await db.insert(users).values([
        { id: pilot, displayName: 'Pilot' },
        { id: pilotOlmayan, displayName: 'Sıradan' },
        { id: baskasi, displayName: 'Başkası' },
      ]);
      await db.insert(boutiques).values({
        id: butikId,
        countryCode: 'TR',
        name: 'Deneme Butik',
        url: `https://www.${butikId}.example.com`,
        coverImageUrl: 'https://example.com/k.jpg',
      });
      const [baglanti] = await db
        .insert(butikBaglantilari)
        .values({
          boutiqueId: butikId,
          platform: 'ikas',
          magazaAdi: 'x',
          kimlikSifreli: 'x',
          durum: 'aktif',
          iletisimEposta: 'a@b.c',
          onaylayanAd: 'A',
          sartlarSurumu: '2026-10-deneme',
          onayAt: new Date(),
          iadePolitikasi: '14 gün içinde iade',
        })
        .returning();
      const baglantiId = baglanti!.id;
      const urun = (disUrunId: string, disVaryantId: string | null, ek = {}) => ({
        baglantiId,
        boutiqueId: butikId,
        disUrunId,
        disVaryantId,
        url: `https://x.example.com/${disUrunId}${disVaryantId ?? ''}`,
        gorseller: [`https://x.example.com/${disUrunId}${disVaryantId ?? ''}.jpg`],
        sonGorulmeAt: new Date(),
        ...ek,
      });
      await db.insert(baglantiUrunleri).values([
        urun('u1', 'v1'),
        urun('u1', null, { aktif: false }), // ürün düzeyi öncelikli, pasif de olsa kullanılır
        urun('u2', 'v9'), // yalnız varyant
      ]);
      const siparis = (
        no: string,
        userId: string,
        durum: string,
        gun: number,
        satirlar: SiparisSatiri[],
      ) => ({
        baglantiId,
        boutiqueId: butikId,
        disSiparisId: `d-${no}`,
        siparisNo: no,
        siparisAt: new Date(Date.UTC(2026, 9, gun)),
        userId,
        durum,
        odendi: durum !== 'odenmedi',
        tutarMinor: 10000,
        currency: 'TRY',
        satirlar,
        kargoFirmasi: 'Yurtiçi',
        takipNo: 'T1',
      });
      await db.insert(butikSiparisleri).values([
        siparis('ESKI', pilot, 'teslim', 1, [
          { ad: 'A', adet: 1, birimFiyatMinor: 10000, disUrunId: 'u1' },
          { ad: 'B', adet: 2, birimFiyatMinor: 5000, disUrunId: 'u2' },
          { ad: 'Silinmis', adet: 1, birimFiyatMinor: 100, disUrunId: 'yok' },
        ]),
        siparis('YENI', pilot, 'kargoda', 5, [
          { ad: 'A', adet: 1, birimFiyatMinor: 10000, disUrunId: 'u1' },
        ]),
        siparis('ODENMEDI', pilot, 'odenmedi', 6, []),
        siparis('BASKASININ', baskasi, 'kargoda', 7, []),
      ]);

      const getir = async (userId: string) => {
        const token = await signAccessToken(userId);
        return app.request('/siparisler', { headers: { authorization: `Bearer ${token}` } });
      };

      // Pilot olmayan: boş.
      const r0 = await getir(pilotOlmayan);
      expect(r0.status).toBe(200);
      expect(await r0.json()).toEqual({ pilot: false, siparisler: [] });

      // Pilot: yalnız kendi ödenmiş siparişleri, yeniden eskiye.
      const r1 = await getir(pilot);
      expect(r1.status).toBe(200);
      const govde = siparislerYanitiSchema.parse(await r1.json());
      expect(govde.pilot).toBe(true);
      expect(govde.siparisler.map((s) => s.siparisNo)).toEqual(['YENI', 'ESKI']);
      const eski = govde.siparisler[1]!;
      expect(eski.butikAdi).toBe('Deneme Butik');
      expect(eski.iadePolitikasi).toBe('14 gün içinde iade');
      expect(eski.butikUrl).toBe(`https://www.${butikId}.example.com`);
      expect(eski.kargoFirmasi).toBe('Yurtiçi');
      expect(eski.satirlar[0]).toEqual({
        ad: 'A',
        adet: 1,
        gorsel: 'https://x.example.com/u1.jpg',
        urunUrl: 'https://x.example.com/u1',
      });
      expect(eski.satirlar[1]?.gorsel).toBe('https://x.example.com/u2v9.jpg');
      // Ürün kaydı yok: sipariş yine gelir, görsel null.
      expect(eski.satirlar[2]).toEqual({ ad: 'Silinmis', adet: 1, gorsel: null, urunUrl: null });

      // Başka kullanıcının siparişi gelmez; kendi hesabında yalnız o görünür.
      const r2 = siparislerYanitiSchema.parse(await (await getir(baskasi)).json());
      expect(r2.siparisler.map((s) => s.siparisNo)).toEqual(['BASKASININ']);

      // Giriş yok.
      expect((await app.request('/siparisler')).status).toBe(401);
    } finally {
      await db.delete(users).where(inArray(users.id, [pilot, pilotOlmayan, baskasi]));
      await db.delete(boutiques).where(inArray(boutiques.id, [butikId]));
    }
  },
);
