import { expect, test } from 'bun:test';
import type { SiteGozlemi } from '../../lib/butik-kontrol/siniflandir';

// Admin: butik kontrolü uçları. Yalnız ayrı yerel butika_notification_test* veritabanında; ağ yok.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

test.skipIf(!testUrl)(
  'butik kontrolü admin uçları',
  async () => {
    const url = new URL(testUrl!);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !url.pathname.startsWith('/butika_notification_test')
    )
      throw new Error('Dedicated local test database required');
    process.env.DATABASE_URL = testUrl;
    Reflect.deleteProperty(process.env, 'BREVO_API_KEY');
    const { env } = await import('../../env');
    if (env.DATABASE_URL !== testUrl) throw new Error('Run this integration file separately');
    const { db } = await import('../../lib/db');
    const { butikKontrolRotalari } = await import('./butik-kontrol');
    const { signAdminAccessToken } = await import('../../lib/jwt');
    const { errorResponse } = await import('../../lib/errors');
    const { Hono } = await import('hono');
    const { eq, inArray } = await import('drizzle-orm');
    const { countries, boutiques, butikKontrolTurlari, butikKontrolBulgulari, butikSiteDurumu } =
      await import('@butika/db');

    let birak: () => void = () => {};
    const kapi = new Promise<void>((r) => {
      birak = r;
    });
    const gozlenen: string[] = [];
    const sahte = async (u: string): Promise<SiteGozlemi> => {
      gozlenen.push(u);
      await kapi;
      return {
        hata: 'ENOTFOUND: kapali',
        status: null,
        sonUrl: null,
        html: '',
        shopifyParaBirimi: null,
      };
    };
    const app = new Hono().route('/admin/butik-kontrol', butikKontrolRotalari(sahte));
    app.onError((err, c) => errorResponse(c, err));
    const token = await signAdminAccessToken(crypto.randomUUID());
    const istek = (yol: string, method = 'GET') =>
      app.request(`/admin/butik-kontrol${yol}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });

    const kimlik = crypto.randomUUID().slice(0, 8);
    const butik = crypto.randomUUID();
    const turlar: string[] = [];
    try {
      // Yetkisiz istek
      expect((await app.request('/admin/butik-kontrol/turlar')).status).toBe(401);

      await db
        .insert(countries)
        .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
        .onConflictDoNothing();
      await db.insert(boutiques).values({
        id: butik,
        countryCode: 'TR',
        name: 'Deneme Butik',
        url: `https://deneme-${kimlik}.example`,
        coverImageUrl: '',
      });

      // Elle çalıştır: tur açılır, döngü sahte gözlemciyle bekler
      const c1 = await istek('/calistir', 'POST');
      expect(c1.status).toBe(200);
      const { turId } = (await c1.json()) as { turId: string };
      turlar.push(turId);
      // Döngü sürerken ikinci çağrı 409
      const c2 = await istek('/calistir', 'POST');
      expect(c2.status).toBe(409);
      expect(await c2.json()).toEqual({ error: 'tur_suruyor', turId });
      birak();
      for (let i = 0; i < 100; i++) {
        const [t] = await db
          .select()
          .from(butikKontrolTurlari)
          .where(eq(butikKontrolTurlari.id, turId));
        if (t?.durum === 'tamam') break;
        await new Promise((r) => setTimeout(r, 50));
      }

      // Liste
      const liste = (await (await istek('/turlar')).json()) as Array<Record<string, unknown>>;
      const satir = liste.find((t) => t.id === turId)!;
      expect(satir.durum).toBe('tamam');
      expect(satir.tetik).toBe('elle');
      expect(Object.keys(satir).sort()).toEqual(
        [
          'baslangic',
          'bitis',
          'durum',
          'id',
          'kontrolEdilen',
          'ozet',
          'sayilar',
          'sorunlu',
          'tetik',
        ].sort(),
      );

      // Detay: önem sırası (yuksek, orta, dusuk, bilgi)
      // Döngünün ürettiği bulguyu temizle; sıralamayı yalnız eklenenlerle sına
      await db.delete(butikKontrolBulgulari).where(eq(butikKontrolBulgulari.turId, turId));
      await db.insert(butikKontrolBulgulari).values([
        {
          turId,
          boutiqueId: butik,
          tur: 'park_satilik',
          onem: 'bilgi',
          kanit: 'b',
          simdikiDeger: null,
        },
        {
          turId,
          boutiqueId: butik,
          tur: 'para_birimi',
          onem: 'dusuk',
          kanit: 'd',
          simdikiDeger: 'EUR',
        },
        {
          turId,
          boutiqueId: butik,
          tur: 'baska_alan_adi',
          onem: 'yuksek',
          kanit: 'y',
          simdikiDeger: 'yeni.com',
        },
        {
          turId,
          boutiqueId: butik,
          tur: 'baslik',
          onem: 'orta',
          kanit: 'o',
          simdikiDeger: 'Başlık',
        },
      ]);
      const detay = (await (await istek(`/turlar/${turId}`)).json()) as {
        tur: { id: string };
        bulgular: Array<{
          id: string;
          onem: string;
          tur: string;
          butikAdi: string;
          ulke: string;
          yoksayildi: boolean;
        }>;
      };
      expect(detay.tur.id).toBe(turId);
      expect(detay.bulgular.map((b) => b.onem)).toEqual(['yuksek', 'orta', 'dusuk', 'bilgi']);
      expect(detay.bulgular[0]!.butikAdi).toBe('Deneme Butik');
      expect(detay.bulgular[0]!.ulke).toBe('TR');
      expect(detay.bulgular.every((b) => b.yoksayildi === false)).toBe(true);
      expect((await istek(`/turlar/${crypto.randomUUID()}`)).status).toBe(404);

      // Yoksay: yalnız kendi anahtarını yazar, diğerlerini korur
      await db
        .update(butikSiteDurumu)
        .set({ yoksay: { baslik: 'Eski' } })
        .where(eq(butikSiteDurumu.boutiqueId, butik));
      const bulguId = detay.bulgular[0]!.id;
      const y = await istek(`/bulgular/${bulguId}/yoksay`, 'POST');
      expect(y.status).toBe(200);
      expect(((await y.json()) as { yoksayildi: boolean }).yoksayildi).toBe(true);
      const [durum] = await db
        .select()
        .from(butikSiteDurumu)
        .where(eq(butikSiteDurumu.boutiqueId, butik));
      expect(durum!.yoksay).toEqual({ baslik: 'Eski', baska_alan_adi: 'yeni.com' });
      // Değeri boş bulgu da yoksayılabilir: '' yazılır, yoksayildi true
      const bos = detay.bulgular[3]!;
      expect(bos.tur).toBe('park_satilik');
      const y2 = await istek(`/bulgular/${bos.id}/yoksay`, 'POST');
      expect(y2.status).toBe(200);
      expect(((await y2.json()) as { yoksayildi: boolean }).yoksayildi).toBe(true);
      const detay2 = (await (await istek(`/turlar/${turId}`)).json()) as typeof detay;
      expect(detay2.bulgular.map((b) => b.yoksayildi)).toEqual([true, false, false, true]);
      expect((await istek(`/bulgular/${crypto.randomUUID()}/yoksay`, 'POST')).status).toBe(404);

      // Yarım kalmış elle tur (döngü yok, ör. API yeniden başladı): devam ettirilir
      const [yarim] = await db
        .insert(butikKontrolTurlari)
        .values({ tetik: 'elle', haftaAnahtari: 'test' })
        .returning({ id: butikKontrolTurlari.id });
      turlar.push(yarim!.id);
      const c3 = await istek('/calistir', 'POST');
      expect(c3.status).toBe(200);
      expect(await c3.json()).toEqual({ turId: yarim!.id });
      for (let i = 0; i < 100; i++) {
        const [t] = await db
          .select()
          .from(butikKontrolTurlari)
          .where(eq(butikKontrolTurlari.id, yarim!.id));
        if (t?.durum === 'tamam') break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const [bitmis] = await db
        .select()
        .from(butikKontrolTurlari)
        .where(eq(butikKontrolTurlari.id, yarim!.id));
      expect(bitmis!.durum).toBe('tamam');
    } finally {
      birak();
      await new Promise((r) => setTimeout(r, 200));
      if (turlar.length)
        await db.delete(butikKontrolTurlari).where(inArray(butikKontrolTurlari.id, turlar));
      await db.delete(boutiques).where(eq(boutiques.id, butik));
    }
  },
  30_000,
);
