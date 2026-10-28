import { expect, test } from 'bun:test';
import type { SiteGozlemi } from './siniflandir';

const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;
test.skipIf(!testUrl)(
  'butik kontrolü turu: başlat, parça parça ilerlet, bitir',
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
    const { db } = await import('../db');
    const { countries, boutiques, butikKontrolTurlari, butikKontrolBulgulari, butikSiteDurumu } =
      await import('@butika/db');
    const { eq, inArray } = await import('drizzle-orm');
    const {
      turBaslat,
      turIlerlet,
      turuSonunaKadarIlerlet,
      epostaGonderGerekirse,
      eskiTurlariTemizle,
    } = await import('./butik-kontrol-job');

    const kimlik = crypto.randomUUID().slice(0, 8);
    const hatali = crypto.randomUUID();
    const euro = crypto.randomUUID();
    const temiz = crypto.randomUUID();
    const butika = crypto.randomUUID();
    const pasif = crypto.randomUUID();
    const garip = crypto.randomUUID();
    const html = (ad: string, fiyat: string) =>
      `<html><head><title>${ad}</title><meta property="og:site_name" content="${ad}"></head><body><h1>${ad}</h1><p>Elbise ${fiyat}</p></body></html>`;
    const gozlenen: string[] = [];
    const sahte = async (u: string): Promise<SiteGozlemi> => {
      gozlenen.push(u);
      if (u.includes('kapali-'))
        return {
          hata: 'ENOTFOUND: kapali',
          status: null,
          sonUrl: null,
          html: '',
          shopifyParaBirimi: null,
        };
      if (u.includes('euro-'))
        return {
          hata: null,
          status: 200,
          sonUrl: u,
          html: html('Euro Butik', '49,00 €'),
          shopifyParaBirimi: 'EUR',
        };
      return {
        hata: null,
        status: 200,
        sonUrl: u,
        html: html('Temiz Butik', '1.299,00 TL'),
        shopifyParaBirimi: 'TRY',
      };
    };
    const turlar: string[] = [];
    const gercekFetch = globalThis.fetch;
    try {
      await db
        .insert(countries)
        .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
        .onConflictDoNothing();
      await db.insert(boutiques).values([
        {
          id: hatali,
          countryCode: 'TR',
          name: 'Kapali Butik',
          url: `https://kapali-${kimlik}.example`,
          coverImageUrl: '',
        },
        {
          id: euro,
          countryCode: 'TR',
          name: 'Euro Butik',
          url: `https://euro-${kimlik}.example`,
          coverImageUrl: '',
        },
        {
          id: temiz,
          countryCode: 'TR',
          name: 'Temiz Butik',
          url: `https://temiz-${kimlik}.example`,
          coverImageUrl: '',
        },
        {
          id: butika,
          countryCode: 'TR',
          name: 'Butika',
          url: 'https://butika.ai',
          coverImageUrl: '',
        },
        {
          id: pasif,
          countryCode: 'TR',
          name: 'Pasif',
          url: `https://pasif-${kimlik}.example`,
          coverImageUrl: '',
          isActive: false,
        },
      ]);

      const id = await turBaslat('elle');
      expect(id).not.toBeNull();
      turlar.push(id!);
      // Tur sürerken ikinci tur başlamaz
      expect(await turBaslat('elle')).toBeNull();
      expect(await turBaslat('haftalik')).toBeNull();

      const bir = await turIlerlet(id!, sahte, 2);
      expect(bir).toEqual({ islenen: 2, bitti: false });
      const iki = await turIlerlet(id!, sahte, 2);
      expect(iki).toEqual({ islenen: 1, bitti: true });
      // Bitmiş tur yeniden ilerletilince bir şey yapmaz
      expect(await turIlerlet(id!, sahte, 2)).toEqual({ islenen: 0, bitti: true });
      expect(gozlenen.some((u) => u.includes('butika.ai') || u.includes('pasif-'))).toBe(false);
      expect(gozlenen).toHaveLength(3);

      const bulgular = await db
        .select()
        .from(butikKontrolBulgulari)
        .where(eq(butikKontrolBulgulari.turId, id!));
      const ozet = bulgular
        .map(
          (b) =>
            `${b.boutiqueId === hatali ? 'kapali' : b.boutiqueId === euro ? 'euro' : 'temiz'}:${b.tur}:${b.onem}`,
        )
        .sort();
      expect(ozet).toEqual(['euro:para_birimi:orta', 'kapali:acilmiyor:orta']);
      expect(bulgular.every((b) => b.yeni)).toBe(true);

      const durumlar = await db
        .select()
        .from(butikSiteDurumu)
        .where(inArray(butikSiteDurumu.boutiqueId, [hatali, euro, temiz, butika, pasif]));
      expect(durumlar).toHaveLength(3);
      expect(durumlar.every((d) => d.turId === id)).toBe(true);
      expect(durumlar.find((d) => d.boutiqueId === hatali)!.ardisikAcilmama).toBe(1);
      expect(durumlar.find((d) => d.boutiqueId === euro)!.sonParaBirimi).toBe('EUR');

      const [tur] = await db
        .select()
        .from(butikKontrolTurlari)
        .where(eq(butikKontrolTurlari.id, id!));
      expect(tur!.durum).toBe('tamam');
      expect(tur!.bitis).not.toBeNull();
      expect(tur!.kontrolEdilen).toBe(3);
      expect(tur!.sorunlu).toBe(2);
      expect(tur!.sayilar).toEqual({
        acilmiyor: { toplam: 1, yuksek: 0 },
        para_birimi: { toplam: 1, yuksek: 0 },
      });
      expect(tur!.ozet).toContain('Bu hafta 3 butik kontrol edildi');

      // İkinci tur: süren sorunlar "yeni" değil; açılmayan site ikinci hafta yüksek
      const id2 = await turBaslat('elle');
      turlar.push(id2!);
      expect(await turIlerlet(id2!, sahte, 10)).toEqual({ islenen: 3, bitti: true });
      const b2 = await db
        .select()
        .from(butikKontrolBulgulari)
        .where(eq(butikKontrolBulgulari.turId, id2!));
      expect(b2.find((b) => b.tur === 'acilmiyor')).toMatchObject({ onem: 'yuksek', yeni: false });
      expect(b2.find((b) => b.tur === 'para_birimi')).toMatchObject({ yeni: false });

      // Haftalık: aynı haftada ikinci kez başlamaz
      const h1 = await turBaslat('haftalik');
      expect(h1).not.toBeNull();
      turlar.push(h1!);
      await turIlerlet(h1!, sahte, 10);
      expect(await turBaslat('haftalik')).toBeNull();

      // Brevo anahtarı yok: hata vermez, e-posta işaretlenmez
      await epostaGonderGerekirse();
      const [h] = await db
        .select()
        .from(butikKontrolTurlari)
        .where(eq(butikKontrolTurlari.id, h1!));
      expect(h!.epostaGonderildiAt).toBeNull();

      // Brevo hazırken: sorunlu hafta için tek e-posta (ağ sahte)
      const giden: {
        url: string;
        govde: { to: { email: string }[]; tags: string[]; textContent: string };
      }[] = [];
      (env as { BREVO_API_KEY?: string }).BREVO_API_KEY = 'test-anahtar-000000';
      globalThis.fetch = (async (u: string, init: RequestInit) => {
        giden.push({ url: String(u), govde: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ messageId: 'm1' }), { status: 201 });
      }) as unknown as typeof fetch;
      try {
        await db
          .update(butikKontrolTurlari)
          .set({ haftaAnahtari: '2026-W41' })
          .where(eq(butikKontrolTurlari.id, h1!));
        await epostaGonderGerekirse(new Date('2026-10-05T05:30:00Z')); // pzt 08:30: erken
        expect(giden).toHaveLength(0);
        await epostaGonderGerekirse(new Date('2026-10-05T07:00:00Z')); // pzt 10:00
        await epostaGonderGerekirse(new Date('2026-10-05T07:01:00Z'));
        expect(giden).toHaveLength(1);
        expect(giden[0]!.url).toContain('api.brevo.com');
        expect(giden[0]!.govde.to).toEqual([{ email: 'hello@butika.ai' }]);
        expect(giden[0]!.govde.tags).toEqual(['butik-kontrol']);
        expect(giden[0]!.govde.textContent).toContain('https://admin.butika.ai/butik-kontrol');
        const [g] = await db
          .select()
          .from(butikKontrolTurlari)
          .where(eq(butikKontrolTurlari.id, h1!));
        expect(g!.epostaGonderildiAt).not.toBeNull();
      } finally {
        globalThis.fetch = gercekFetch;
        (env as { BREVO_API_KEY?: string }).BREVO_API_KEY = undefined;
      }

      // Brevo hatası: saatte en çok bir deneme, tur başına en çok 12
      await db
        .update(butikKontrolTurlari)
        .set({ epostaGonderildiAt: null })
        .where(eq(butikKontrolTurlari.id, h1!));
      let hataliIstek = 0;
      (env as { BREVO_API_KEY?: string }).BREVO_API_KEY = 'test-anahtar-000000';
      globalThis.fetch = (async () => {
        hataliIstek++;
        return new Response('sunucu hatası', { status: 500 });
      }) as unknown as typeof fetch;
      try {
        const saat = (dk: number) => new Date(Date.parse('2026-10-05T08:00:00Z') + dk * 60_000);
        await epostaGonderGerekirse(saat(0));
        expect(hataliIstek).toBe(1);
        await epostaGonderGerekirse(saat(1));
        await epostaGonderGerekirse(saat(59));
        expect(hataliIstek).toBe(1);
        await epostaGonderGerekirse(saat(60));
        expect(hataliIstek).toBe(2);
        for (let s = 2; s <= 30; s++) await epostaGonderGerekirse(saat(s * 60));
        expect(hataliIstek).toBe(12);
        const [g] = await db
          .select()
          .from(butikKontrolTurlari)
          .where(eq(butikKontrolTurlari.id, h1!));
        expect(g!.epostaGonderildiAt).toBeNull();
      } finally {
        globalThis.fetch = gercekFetch;
        (env as { BREVO_API_KEY?: string }).BREVO_API_KEY = undefined;
      }

      // SQL süzgecinden kaçan Butika adresi turu kilitlemez (sıkı döngü yok)
      await db.insert(boutiques).values({
        id: garip,
        countryCode: 'TR',
        name: 'Garip Butika',
        url: ' //butika.ai/x',
        coverImageUrl: '',
      });
      const id3 = await turBaslat('elle');
      expect(id3).not.toBeNull();
      turlar.push(id3!);
      const onceGozlenen = gozlenen.length;
      const sonuc = await Promise.race([
        turuSonunaKadarIlerlet(id3!, sahte),
        new Promise<'asildi'>((r) => setTimeout(() => r('asildi'), 5_000)),
      ]);
      expect(sonuc).toBe(true);
      expect(gozlenen.slice(onceGozlenen).some((u) => u.includes('butika.ai'))).toBe(false);
      const [t3] = await db
        .select()
        .from(butikKontrolTurlari)
        .where(eq(butikKontrolTurlari.id, id3!));
      expect(t3!.durum).toBe('tamam');
      expect(t3!.kontrolEdilen).toBe(3);
      const [gd] = await db
        .select()
        .from(butikSiteDurumu)
        .where(eq(butikSiteDurumu.boutiqueId, garip));
      expect(gd!.turId).toBe(id3);
      expect(
        await db
          .select()
          .from(butikKontrolBulgulari)
          .where(eq(butikKontrolBulgulari.boutiqueId, garip)),
      ).toHaveLength(0);

      // 26 haftadan eski turlar (bulgularıyla) silinir
      await db
        .update(butikKontrolTurlari)
        .set({ baslangic: new Date(Date.now() - 27 * 7 * 86400000) })
        .where(eq(butikKontrolTurlari.id, id!));
      await eskiTurlariTemizle();
      expect(
        await db.select().from(butikKontrolTurlari).where(eq(butikKontrolTurlari.id, id!)),
      ).toHaveLength(0);
      expect(
        await db.select().from(butikKontrolBulgulari).where(eq(butikKontrolBulgulari.turId, id!)),
      ).toHaveLength(0);
    } finally {
      if (turlar.length)
        await db.delete(butikKontrolTurlari).where(inArray(butikKontrolTurlari.id, turlar));
      await db
        .delete(boutiques)
        .where(inArray(boutiques.id, [hatali, euro, temiz, butika, pasif, garip]));
    }
  },
  30_000,
);
