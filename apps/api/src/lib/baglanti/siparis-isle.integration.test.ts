import { expect, spyOn, test } from 'bun:test';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { HamSiparis } from './ikas/ikas-siparis';

// Bağlı butik siparişleri: atıf, komisyon, iptal, webhook, saatlik tarama, webhook kaydı.
// Yalnız ayrı, yerel ve adı butika_notification_test ile başlayan veritabanında; dosyayı tek
// başına çalıştırın. ikas sahte (fikstür); gerçek mağazaya istek gitmez.
const testUrl = process.env.BUTIKA_NOTIFICATION_TEST_URL;

/** Fikstürdeki ham ikas siparişi (müşteri alanı yalnız kişisel veri denetimi için). */
type HamSiparisFiksturu = HamSiparis & { updatedAt: number; customer: { id: string } };

test.skipIf(!testUrl)(
  'siparişler: atıf, komisyon, iptal, iade, webhook, tarama, eşzamanlılık, kişisel veri yok',
  async () => {
    const url = new URL(testUrl!);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !url.pathname.startsWith('/butika_notification_test')
    ) {
      throw new Error('A dedicated local butika_notification_test database is required');
    }
    process.env.DATABASE_URL = testUrl;
    const ANAHTAR = randomBytes(32).toString('base64');
    const GIZLI = 'test-istemci-gizli';
    process.env.BAGLANTI_SIFRELEME_ANAHTARI = ANAHTAR;
    process.env.IKAS_CLIENT_ID = 'test-istemci';
    process.env.IKAS_CLIENT_SECRET = GIZLI;
    const { env } = await import('../../env');
    if (env.DATABASE_URL !== testUrl || env.BAGLANTI_SIFRELEME_ANAHTARI !== ANAHTAR)
      throw new Error('Configuration was already loaded; run this test file separately');
    const { db } = await import('../db');
    const { siparisiIsle, siparisBildirimleriniKaydet } = await import('./siparis-isle');
    const { bekleyenSiparisleriTara } = await import('./siparis-tarama-job');
    const { siparisAyristir } = await import('./ikas/ikas-siparis');
    const { komisyonHesapla, yeniGonderimId } = await import('./kurallar');
    const { katilimRoutes, katilimBagimliliklari } = await import('../../routes/katilim');
    const { sifrele } = await import('../sifreleme');
    const { logger } = await import('../logger');
    const { Hono } = await import('hono');
    const { eq } = await import('drizzle-orm');
    const { boutiques, butikBaglantilari, butikSiparisleri, countries, gonderimler, users } =
      await import('@butika/db');

    const fikstur = (ad: string): HamSiparisFiksturu =>
      JSON.parse(readFileSync(new URL(`./ikas/fixtures/${ad}.json`, import.meta.url), 'utf8')).data
        .listOrder.data[0];
    const HAM_BUTIKA = fikstur('siparis-butika');
    const HAM_DOGRUDAN = fikstur('siparis-dogrudan');
    const HAM_IPTAL = fikstur('siparis-iptal-odenmedi');
    // Fikstür siparişlerinden bir saat önce bağlandı.
    const BAGLANDI = new Date(HAM_BUTIKA.orderedAt - 3600_000);

    const tag = crypto.randomUUID().slice(0, 8);
    const butikId = crypto.randomUUID();
    const baskaButikId = crypto.randomUUID();
    const ikinciButikId = crypto.randomUUID();
    const ucuncuButikId = crypto.randomUUID();
    const baglantiId = crypto.randomUUID();
    const baskaBaglantiId = crypto.randomUUID();
    const ikinciBaglantiId = crypto.randomUUID();
    const ucuncuBaglantiId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const gonderimId = yeniGonderimId();
    const baskaGonderimId = yeniGonderimId();
    const MAGAZA = `dev-a-${tag}`;
    const MAGAZA_GECICI = `dev-b-${tag}`;
    const MAGAZA_YETKI = `dev-c-${tag}`;
    const MAGAZA_KAPALI = `dev-d-${tag}`;
    const YETKILI = `yetkili-${tag}`;
    const MERCHANT = `merchant-${tag}`;

    /** Fikstürden yeni kimlikli sipariş; `utm` null ise sessionInfo yok. */
    const siparis = (
      ham: HamSiparisFiksturu,
      id: string,
      degis: Record<string, unknown> = {},
      utm?: string | null,
    ) => {
      const h = structuredClone(ham);
      h.id = id;
      Object.assign(h, degis);
      if (utm !== undefined)
        h.sessionInfo = utm === null ? null : { utm: { source: 'butika', content: utm } };
      return h;
    };

    // --- sahte ikas: mağaza başına sipariş listesi; token adresinden mağaza ayırt edilir.
    const magazaSiparisleri = new Map<string, HamSiparisFiksturu[]>();
    const taramaBaslangiclari: { magaza: string; sonra: number }[] = [];
    const kayitIstekleri: { magaza: string; input: { endpoint: string; scopes: string[] } }[] = [];
    let tekSiparisHatasi = false;
    const sahteFetch = (async (girdi: string | URL | Request, init?: RequestInit) => {
      const adres = String(girdi instanceof Request ? girdi.url : girdi);
      const tokenMagazasi = adres.match(
        /^https:\/\/([^.]+)\.myikas\.com\/api\/admin\/oauth\/token$/,
      );
      if (tokenMagazasi)
        return Response.json({
          access_token: `erisim-${tokenMagazasi[1]}`,
          refresh_token: 'y',
          expires_in: 14400,
        });
      if (adres !== 'https://api.myikas.com/api/v1/admin/graphql')
        throw new Error(`adres ${adres}`);
      const yetki = new Headers(init?.headers).get('authorization') ?? '';
      const magaza = yetki.replace('Bearer erisim-', '');
      if (magaza === MAGAZA_YETKI) return new Response('{}', { status: 401 });
      if (magaza === MAGAZA_GECICI) throw new TypeError('fetch failed');
      const { query, variables } = JSON.parse(String(init?.body));
      if (query.includes('saveWebhook')) {
        kayitIstekleri.push({ magaza, input: variables.input });
        return Response.json({
          data: {
            saveWebhook: variables.input.scopes.map((s: string) => ({
              id: s,
              scope: s,
              endpoint: variables.input.endpoint,
            })),
          },
        });
      }
      const liste = magazaSiparisleri.get(magaza) ?? [];
      if (variables.id !== undefined) {
        if (tekSiparisHatasi) return Response.json({ errors: [{ message: 'ic hata' }] });
        return Response.json({
          data: { listOrder: { data: liste.filter((s) => s.id === variables.id) } },
        });
      }
      if (variables.page === 1) taramaBaslangiclari.push({ magaza, sonra: variables.sonra });
      const bas = (variables.page - 1) * variables.limit;
      return Response.json({
        data: { listOrder: { data: liste.slice(bas, bas + variables.limit) } },
      });
    }) as unknown as typeof fetch;
    katilimBagimliliklari.fetchFn = sahteFetch;

    const app = new Hono();
    app.route('/katilim', katilimRoutes);
    const imza = (m: string) => createHmac('sha256', GIZLI).update(m).digest('hex');
    const bildirim = (govde: Record<string, unknown>) =>
      app.request('/katilim/ikas/bildirim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(govde),
      });
    const siparisBildirimi = (
      disSiparisId: string,
      degis: Record<string, unknown> = {},
      scope = 'store/order/updated',
    ) => {
      const data = JSON.stringify({ id: disSiparisId, merchantId: MERCHANT, orderNumber: '1' });
      return {
        id: `w-${disSiparisId}`,
        createdAt: Date.now(),
        scope,
        merchantId: MERCHANT,
        authorizedAppId: YETKILI,
        data,
        signature: imza(data),
        ...degis,
      };
    };

    const gelecek = new Date(Date.now() + 3 * 3600_000).toISOString();
    const baglantiSatiri = (id: string, bid: string, magaza: string, durum = 'aktif') => ({
      id,
      boutiqueId: bid,
      platform: 'ikas',
      magazaAdi: magaza,
      kimlikSifreli: sifrele(
        JSON.stringify({ erisim: `erisim-${magaza}`, yenileme: 'y', bitisAt: gelecek }),
        ANAHTAR,
      ),
      durum,
      tahsilat: 'deneme',
      iletisimEposta: 'e@example.test',
      onaylayanAd: 'Test',
      sartlarSurumu: '2026-10-deneme',
      onayAt: new Date('2026-10-01T00:00:00Z'),
    });
    const satirlar = async (id = baglantiId) =>
      db.select().from(butikSiparisleri).where(eq(butikSiparisleri.baglantiId, id));
    const satir = async (disSiparisId: string, id = baglantiId) =>
      (await satirlar(id)).find((s) => s.disSiparisId === disSiparisId);
    const baglantiOku = async (id: string) =>
      (await db.select().from(butikBaglantilari).where(eq(butikBaglantilari.id, id)))[0]!;

    try {
      await db
        .insert(countries)
        .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr' })
        .onConflictDoNothing();
      await db.insert(boutiques).values(
        [butikId, baskaButikId, ikinciButikId, ucuncuButikId].map((id, i) => ({
          id,
          countryCode: 'TR',
          name: `Siparis ${i}`,
          url: `https://siparis-${id}.example`,
          coverImageUrl: '',
        })),
      );
      await db.insert(users).values({ id: userId, displayName: 'Sipariş Test' });
      await db.insert(gonderimler).values([
        { id: gonderimId, userId, boutiqueId: butikId, url: 'https://e.com/u' },
        { id: baskaGonderimId, userId, boutiqueId: baskaButikId, url: 'https://e.com/u' },
      ]);
      await db.insert(butikBaglantilari).values([
        {
          ...baglantiSatiri(baglantiId, butikId, MAGAZA),
          ikasYetkiliUygulamaId: YETKILI,
          ikasMerchantId: MERCHANT,
          baglandiAt: BAGLANDI,
        },
        baglantiSatiri(baskaBaglantiId, baskaButikId, MAGAZA_KAPALI, 'kapali'),
        baglantiSatiri(ikinciBaglantiId, ikinciButikId, MAGAZA_GECICI),
        baglantiSatiri(ucuncuBaglantiId, ucuncuButikId, MAGAZA_YETKI),
      ]);

      // 1) Butika'dan gelen ödenmiş sipariş: satır, kullanıcı atfı, %10 komisyon.
      const s1 = siparisAyristir(siparis(HAM_BUTIKA, `o1-${tag}`, {}, gonderimId));
      expect(await siparisiIsle(baglantiId, s1)).toBe('yeni');
      const r1 = (await satir(`o1-${tag}`))!;
      expect(r1.userId).toBe(userId);
      expect(r1.gonderimId).toBe(gonderimId);
      expect(r1.boutiqueId).toBe(butikId);
      expect(r1.odendi).toBe(true);
      expect(r1.durum).toBe('kargoda');
      expect(r1.tutarMinor).toBe(s1.tutarMinor);
      expect(r1.komisyonMinor).toBe(komisyonHesapla(s1.tutarMinor));
      expect(r1.komisyonAt).not.toBeNull();
      expect(r1.takipNo).toBe('TEST1006');

      // 1b) Bağlanmadan önce verilmiş sipariş: kaydedilir ama komisyon yazılmaz (yeniden
      // bağlanınca kapalı dönemin siparişleri faturalanmaz).
      const once = siparisAyristir(
        siparis(HAM_BUTIKA, `once-${tag}`, { orderedAt: BAGLANDI.getTime() - 60_000 }, gonderimId),
      );
      expect(await siparisiIsle(baglantiId, once)).toBe('yeni');
      expect((await satir(`once-${tag}`))!.gonderimId).toBe(gonderimId);
      expect((await satir(`once-${tag}`))!.komisyonMinor).toBeNull();
      expect(await siparisiIsle(baglantiId, once)).toBe('guncellendi');
      expect((await satir(`once-${tag}`))!.komisyonMinor).toBeNull();
      await db.delete(butikSiparisleri).where(eq(butikSiparisleri.disSiparisId, `once-${tag}`));

      // 2) Aynı sipariş ikinci kez (webhook + tarama): güncellendi, tek satır, komisyon aynı.
      expect(await siparisiIsle(baglantiId, s1)).toBe('guncellendi');
      const r2 = (await satir(`o1-${tag}`))!;
      expect(await satirlar()).toHaveLength(1);
      expect(r2.komisyonMinor).toBe(r1.komisyonMinor);
      expect(r2.komisyonAt!.getTime()).toBe(r1.komisyonAt!.getTime());

      // 3) İade: durum güncellenir, komisyon aynı kalır (iadeler takip edilmez).
      const s3 = siparisAyristir(
        siparis(HAM_BUTIKA, `o1-${tag}`, { status: 'REFUNDED' }, gonderimId),
      );
      expect(await siparisiIsle(baglantiId, s3)).toBe('guncellendi');
      const r3 = (await satir(`o1-${tag}`))!;
      expect(r3.durum).toBe('iptal');
      expect(r3.komisyonMinor).toBe(r1.komisyonMinor);
      expect(r3.komisyonAt!.getTime()).toBe(r1.komisyonAt!.getTime());

      // 4) Sonradan UTM'siz gelse de mevcut kayıt güncellenir; atıf değişmez.
      const s4 = siparisAyristir(siparis(HAM_BUTIKA, `o1-${tag}`, {}, null));
      expect(await siparisiIsle(baglantiId, s4)).toBe('guncellendi');
      const r4 = (await satir(`o1-${tag}`))!;
      expect(r4.gonderimId).toBe(gonderimId);
      expect(r4.userId).toBe(userId);
      expect(r4.komisyonMinor).toBe(r1.komisyonMinor);

      // 5) Ödenmiş → komisyon yazıldı → tamamen iptal: komisyon silinir.
      const s5a = siparisAyristir(siparis(HAM_BUTIKA, `o5-${tag}`, {}, gonderimId));
      expect(await siparisiIsle(baglantiId, s5a)).toBe('yeni');
      expect((await satir(`o5-${tag}`))!.komisyonMinor).toBe(komisyonHesapla(s5a.tutarMinor));
      const s5b = siparisAyristir(
        siparis(HAM_BUTIKA, `o5-${tag}`, { status: 'CANCELLED' }, gonderimId),
      );
      expect(await siparisiIsle(baglantiId, s5b)).toBe('guncellendi');
      const r5 = (await satir(`o5-${tag}`))!;
      expect(r5.durum).toBe('iptal');
      expect(r5.komisyonMinor).toBeNull();
      expect(r5.komisyonAt).toBeNull();
      // Paket iptali de tam iptaldir; iptalken komisyon hiç yazılmaz.
      const s5c = siparisAyristir(
        siparis(HAM_BUTIKA, `o5c-${tag}`, { orderPackageStatus: 'CANCELLED' }, gonderimId),
      );
      expect(await siparisiIsle(baglantiId, s5c)).toBe('yeni');
      expect((await satir(`o5c-${tag}`))!.komisyonMinor).toBeNull();

      // 5d) İptalden sonra iade: faturalanmaz. İptalden sonra gerçek yeniden açılma: komisyon yeniden yazılır.
      for (const [ad, sonraki] of [
        ['iade', { status: 'REFUNDED' }],
        ['acilma', { status: 'CREATED' }],
      ] as const) {
        const id = `o5d-${ad}-${tag}`;
        const t0 = HAM_BUTIKA.updatedAt;
        await siparisiIsle(baglantiId, siparisAyristir(siparis(HAM_BUTIKA, id, {}, gonderimId)));
        await siparisiIsle(
          baglantiId,
          siparisAyristir(
            siparis(HAM_BUTIKA, id, { status: 'CANCELLED', updatedAt: t0 + 1000 }, gonderimId),
          ),
        );
        expect(
          await siparisiIsle(
            baglantiId,
            siparisAyristir(
              siparis(
                HAM_BUTIKA,
                id,
                { ...sonraki, orderPaymentStatus: 'PAID', updatedAt: t0 + 2000 },
                gonderimId,
              ),
            ),
          ),
        ).toBe('guncellendi');
        const r = (await satir(id))!;
        expect(r.iptalGorulduAt).not.toBeNull(); // denetim izi açılınca da kalır
        if (ad === 'iade') {
          expect(r.komisyonMinor).toBeNull();
          expect(r.komisyonAt).toBeNull();
        } else {
          expect(r.komisyonMinor).toBe(komisyonHesapla(siparisAyristir(HAM_BUTIKA).tutarMinor));
          expect(r.komisyonAt).not.toBeNull();
          expect(r.durum).toBe('kargoda');
        }
      }

      // 5e) Eski anlık görüntü yok sayılır: yeni CANCELLED, ardından eski PAID.
      const eskiId = `o5e-${tag}`;
      const t0 = HAM_BUTIKA.updatedAt;
      expect(
        await siparisiIsle(
          baglantiId,
          siparisAyristir(
            siparis(HAM_BUTIKA, eskiId, { status: 'CANCELLED', updatedAt: t0 + 5000 }, gonderimId),
          ),
        ),
      ).toBe('yeni');
      const r5e = (await satir(eskiId))!;
      expect(
        await siparisiIsle(
          baglantiId,
          siparisAyristir(siparis(HAM_BUTIKA, eskiId, { updatedAt: t0 }, gonderimId)),
        ),
      ).toBe('atlandi');
      const r5e2 = (await satir(eskiId))!;
      expect(r5e2.komisyonMinor).toBeNull();
      expect(r5e2.durum).toBe('iptal');
      expect(r5e2.disGuncellemeAt!.getTime()).toBe(t0 + 5000);
      expect(r5e2.updatedAt.getTime()).toBe(r5e.updatedAt.getTime());
      // updatedAt'i olmayan anlık görüntü saklı disGuncellemeAt'i silmez.
      expect(
        await siparisiIsle(
          baglantiId,
          siparisAyristir(siparis(HAM_BUTIKA, eskiId, { updatedAt: null }, gonderimId)),
        ),
      ).toBe('guncellendi');
      expect((await satir(eskiId))!.disGuncellemeAt!.getTime()).toBe(t0 + 5000);

      // 5f) Ödenmemiş → ödendi: komisyon tam bir kez yazılır; aynı PAID tekrarında değişmez.
      const odemeId = `o5f-${tag}`;
      expect(
        await siparisiIsle(
          baglantiId,
          siparisAyristir(
            siparis(HAM_BUTIKA, odemeId, { orderPaymentStatus: 'WAITING' }, gonderimId),
          ),
        ),
      ).toBe('yeni');
      expect((await satir(odemeId))!.komisyonMinor).toBeNull();
      const odenmis = siparisAyristir(
        siparis(HAM_BUTIKA, odemeId, { updatedAt: t0 + 1000 }, gonderimId),
      );
      expect(await siparisiIsle(baglantiId, odenmis)).toBe('guncellendi');
      const r5f = (await satir(odemeId))!;
      expect(r5f.odendi).toBe(true);
      expect(r5f.komisyonMinor).toBe(komisyonHesapla(odenmis.tutarMinor));
      expect(await siparisiIsle(baglantiId, odenmis, new Date(Date.now() + 3600_000))).toBe(
        'guncellendi',
      );
      const r5f2 = (await satir(odemeId))!;
      expect(r5f2.komisyonMinor).toBe(r5f.komisyonMinor);
      expect(r5f2.komisyonAt!.getTime()).toBe(r5f.komisyonAt!.getTime());

      // 5g) Bağlantı aktif değil: hiçbir şey yazılmaz.
      expect(
        await siparisiIsle(
          baskaBaglantiId,
          siparisAyristir(siparis(HAM_BUTIKA, `o5g-${tag}`, {}, baskaGonderimId)),
        ),
      ).toBe('atlandi');
      expect(await satirlar(baskaBaglantiId)).toHaveLength(0);

      // 6) İptal, ödenmemiş (Butika'dan): odendi=false, komisyon yok.
      const s6 = siparisAyristir(siparis(HAM_IPTAL, `o6-${tag}`, {}, gonderimId));
      expect(await siparisiIsle(baglantiId, s6)).toBe('yeni');
      const r6 = (await satir(`o6-${tag}`))!;
      expect(r6.odendi).toBe(false);
      expect(r6.durum).toBe('odenmedi');
      expect(r6.komisyonMinor).toBeNull();

      // 7) Doğrudan sipariş (Butika'nın değil): hiç yazılmaz.
      const s7 = siparisAyristir(siparis(HAM_DOGRUDAN, `o7-${tag}`));
      expect(await siparisiIsle(baglantiId, s7)).toBe('atlandi');
      expect(await satir(`o7-${tag}`)).toBeUndefined();

      // 8) Butika UTM'i ama gönderim başka butiğin: satır var, atıf ve komisyon yok.
      const s8 = siparisAyristir(siparis(HAM_BUTIKA, `o8-${tag}`, {}, baskaGonderimId));
      expect(await siparisiIsle(baglantiId, s8)).toBe('yeni');
      const r8 = (await satir(`o8-${tag}`))!;
      expect(r8.gonderimId).toBeNull();
      expect(r8.userId).toBeNull();
      expect(r8.komisyonMinor).toBeNull();

      // 9) Aynı yeni sipariş eşzamanlı iki kez: tek satır, tek "yeni".
      const s9 = siparisAyristir(siparis(HAM_BUTIKA, `o9-${tag}`, {}, gonderimId));
      const sonuclar = await Promise.all([
        siparisiIsle(baglantiId, s9),
        siparisiIsle(baglantiId, s9),
        siparisiIsle(baglantiId, s9),
      ]);
      expect(sonuclar.filter((x) => x === 'yeni')).toHaveLength(1);
      expect(sonuclar.filter((x) => x === 'guncellendi')).toHaveLength(2);
      expect((await satirlar()).filter((s) => s.disSiparisId === `o9-${tag}`)).toHaveLength(1);
      expect((await satir(`o9-${tag}`))!.komisyonMinor).toBe(komisyonHesapla(s9.tutarMinor));

      // --- Webhook (tek uç: /katilim/ikas/bildirim)
      const w1 = siparis(HAM_BUTIKA, `w1-${tag}`, {}, gonderimId);
      magazaSiparisleri.set(MAGAZA, [w1]);
      // imza yanlış → 401, iz yok
      expect(
        (await bildirim({ ...siparisBildirimi(`w1-${tag}`), signature: 'ab'.repeat(32) })).status,
      ).toBe(401);
      expect(await satir(`w1-${tag}`)).toBeUndefined();
      // başka mağaza kimliği → 200, iz yok
      const baskaMerchant = siparisBildirimi(`w1-${tag}`);
      expect((await bildirim({ ...baskaMerchant, merchantId: 'baska' })).status).toBe(401); // içteki merchantId farklı
      const icAyni = JSON.stringify({ id: `w1-${tag}`, merchantId: 'baska' });
      expect(
        (
          await bildirim({
            ...siparisBildirimi(`w1-${tag}`),
            merchantId: 'baska',
            data: icAyni,
            signature: imza(icAyni),
          })
        ).status,
      ).toBe(200);
      expect(await satir(`w1-${tag}`)).toBeUndefined();
      // bağlanmadan önceki bildirim → 200, iz yok
      expect(
        (await bildirim(siparisBildirimi(`w1-${tag}`, { createdAt: BAGLANDI.getTime() - 3600_000 })))
          .status,
      ).toBe(200);
      expect(await satir(`w1-${tag}`)).toBeUndefined();
      // dış authorizedAppId yok → 200, iz yok, kişisel veri içermeyen bir uyarı
      const uyari = spyOn(logger, 'warn');
      const uygulamasiz = siparisBildirimi(`w1-${tag}`);
      delete (uygulamasiz as Record<string, unknown>).authorizedAppId;
      expect((await bildirim(uygulamasiz)).status).toBe(200);
      expect(await satir(`w1-${tag}`)).toBeUndefined();
      expect(uyari.mock.calls.map((c) => c.at(-1))).toContain(
        'katilim: sipariş bildiriminde authorizedAppId yok, yok sayıldı',
      );
      uyari.mockRestore();
      // bilinmeyen kapsam → 200, iz yok
      expect(
        (await bildirim(siparisBildirimi(`w1-${tag}`, {}, 'store/product/updated'))).status,
      ).toBe(200);
      expect(await satir(`w1-${tag}`)).toBeUndefined();
      // sipariş kimliği yok → 200, iz yok
      const kimliksiz = JSON.stringify({ merchantId: MERCHANT });
      expect(
        (
          await bildirim({
            ...siparisBildirimi(`w1-${tag}`),
            data: kimliksiz,
            signature: imza(kimliksiz),
          })
        ).status,
      ).toBe(200);
      expect(await satir(`w1-${tag}`)).toBeUndefined();
      // geçerli created: data'daki id ile ikas'tan yeniden okunur → satır
      expect(
        (await bildirim(siparisBildirimi(`w1-${tag}`, {}, 'store/order/created'))).status,
      ).toBe(200);
      const rw1 = (await satir(`w1-${tag}`))!;
      expect(rw1.userId).toBe(userId);
      expect(rw1.komisyonMinor).toBe(komisyonHesapla(siparisAyristir(w1).tutarMinor));
      // data'daki tutar/durum kullanılmaz: ikas'ta iptal olunca updated bildirimi komisyonu siler
      magazaSiparisleri.set(MAGAZA, [{ ...w1, status: 'CANCELLED' }]);
      const sahteVeri = JSON.stringify({
        id: `w1-${tag}`,
        merchantId: MERCHANT,
        status: 'CREATED',
      });
      expect(
        (
          await bildirim({
            ...siparisBildirimi(`w1-${tag}`),
            data: sahteVeri,
            signature: imza(sahteVeri),
          })
        ).status,
      ).toBe(200);
      expect((await satir(`w1-${tag}`))!.komisyonMinor).toBeNull();
      // ikas'ta bulunmayan sipariş → 200, iz yok
      expect((await bildirim(siparisBildirimi(`yok-${tag}`))).status).toBe(200);
      expect(await satir(`yok-${tag}`)).toBeUndefined();
      // işlem hatası → 500 (ikas yeniden dener)
      tekSiparisHatasi = true;
      expect((await bildirim(siparisBildirimi(`w1-${tag}`))).status).toBe(500);
      tekSiparisHatasi = false;
      // bağlantı aktif değil → 200, hiçbir şey yapılmaz
      await db
        .update(butikBaglantilari)
        .set({ durum: 'koptu' })
        .where(eq(butikBaglantilari.id, baglantiId));
      magazaSiparisleri.set(MAGAZA, [siparis(HAM_BUTIKA, `w2-${tag}`, {}, gonderimId)]);
      expect((await bildirim(siparisBildirimi(`w2-${tag}`))).status).toBe(200);
      expect(await satir(`w2-${tag}`)).toBeUndefined();
      await db
        .update(butikBaglantilari)
        .set({ durum: 'aktif' })
        .where(eq(butikBaglantilari.id, baglantiId));

      // --- Saatlik tarama: sırayla; biri hata verse de diğerleri işlenir.
      const t1 = siparis(HAM_BUTIKA, `t1-${tag}`, {}, gonderimId);
      magazaSiparisleri.set(MAGAZA, [t1, siparis(HAM_DOGRUDAN, `t2-${tag}`), w1]);
      const simdi1 = new Date(Date.now() + 60_000);
      await bekleyenSiparisleriTara(simdi1, sahteFetch);
      expect((await satir(`t1-${tag}`))!.userId).toBe(userId);
      expect(await satir(`t2-${tag}`)).toBeUndefined();
      // İlk tarama bağlanma anından başlar (öncesine gidilmez)
      const ilk = taramaBaslangiclari.find((x) => x.magaza === MAGAZA)!;
      expect(ilk.sonra).toBe(BAGLANDI.getTime());
      expect((await baglantiOku(baglantiId)).sonSiparisTaramaAt!.getTime()).toBe(simdi1.getTime());
      // Geçici hata: tarih değişmez, bağlantı aktif kalır
      const gecici = await baglantiOku(ikinciBaglantiId);
      expect(gecici.durum).toBe('aktif');
      expect(gecici.sonSiparisTaramaAt).toBeNull();
      // Yetki reddi: Task 8 ile aynı 'koptu' işlemi
      const kopan = await baglantiOku(ucuncuBaglantiId);
      expect(kopan.durum).toBe('koptu');
      expect(kopan.sonHata).toBe('ikas_yetki_reddedildi');
      // Kapalı bağlantı taranmaz
      expect(taramaBaslangiclari.some((x) => x.magaza === MAGAZA_KAPALI)).toBe(false);
      // Webhook ve taramada aynı sipariş tek satır
      expect((await satirlar()).filter((s) => s.disSiparisId === `w1-${tag}`)).toHaveLength(1);

      // Bir saat dolmadan yeniden taranmaz; dolunca sonSiparisTaramaAt − 1 günden başlar.
      taramaBaslangiclari.length = 0;
      await bekleyenSiparisleriTara(new Date(simdi1.getTime() + 10 * 60_000), sahteFetch);
      expect(taramaBaslangiclari.some((x) => x.magaza === MAGAZA)).toBe(false);
      const simdi2 = new Date(simdi1.getTime() + 61 * 60_000);
      await bekleyenSiparisleriTara(simdi2, sahteFetch);
      expect(taramaBaslangiclari.find((x) => x.magaza === MAGAZA)!.sonra).toBe(
        simdi1.getTime() - 24 * 3600_000,
      );
      expect((await baglantiOku(baglantiId)).sonSiparisTaramaAt!.getTime()).toBe(simdi2.getTime());

      // --- Kişisel veri: hiçbir satırda müşteri adı/e-posta/telefon/adres/IP yok.
      const tumu = JSON.stringify(await satirlar());
      for (const yasak of [
        'Ayşe',
        'Örnek',
        'musteri@example.com',
        '+905550000000',
        'Deneme Sk',
        '203.0.113.10',
        HAM_BUTIKA.customer.id,
      ])
        expect(tumu).not.toContain(yasak);

      // --- ikas webhook kaydı: https uç noktası, iki sipariş kapsamı.
      expect(await siparisBildirimleriniKaydet(baglantiId, sahteFetch)).toBe(true);
      expect(kayitIstekleri).toEqual([
        {
          magaza: MAGAZA,
          input: {
            endpoint: `${new URL(env.IKAS_YONLENDIRME_URL).origin}/katilim/ikas/bildirim`,
            scopes: ['store/order/created', 'store/order/updated'],
          },
        },
      ]);
      expect(kayitIstekleri[0]!.input.endpoint.startsWith('https://')).toBe(true);
      // Yerel (https değil) adreste atlanır; hata fırlatmaz.
      const eski = env.IKAS_YONLENDIRME_URL;
      (env as { IKAS_YONLENDIRME_URL: string }).IKAS_YONLENDIRME_URL =
        'http://localhost:3000/katilim/ikas/geri-donus';
      try {
        expect(await siparisBildirimleriniKaydet(baglantiId, sahteFetch)).toBe(false);
      } finally {
        (env as { IKAS_YONLENDIRME_URL: string }).IKAS_YONLENDIRME_URL = eski;
      }
      expect(kayitIstekleri).toHaveLength(1);
      // ikas hatası: false döner, fırlatmaz
      expect(await siparisBildirimleriniKaydet(ikinciBaglantiId, sahteFetch)).toBe(false);
    } finally {
      await db.delete(users).where(eq(users.id, userId));
      for (const id of [butikId, baskaButikId, ikinciButikId, ucuncuButikId])
        await db.delete(boutiques).where(eq(boutiques.id, id)); // cascade
    }
  },
);
