import { boutiques, brandContacts, contactCandidates, contactDiscoveryJobs } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { alanAdiCikar, iletisimBilgisiAra } from '../../lib/contact-discovery/discover-contacts';
import { incelemeGrubu } from '../../lib/contact-discovery/review-groups';
import { taramaSonucunuKaydet } from '../../lib/contact-discovery/store-contacts';
import { db } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import { resolveMarket } from '../../lib/market';

export const adminContactRoutes = new Hono<AdminContext>();

adminContactRoutes.use('*', requireAdmin);

// Tek istekte taranabilecek en fazla butik. Toplu tarama (574) bu uctan DEGIL,
// ayri bir kuyruk isinden yurutulecek; buradaki sinir kazayla yuzlerce siteye
// ayni anda istek atmayi onler.
const TEK_SEFERDE_MAKS_TARAMA = 10;

const durumSemasi = z.enum([
  'hepsi',
  'bulundu',
  'bulunamadi',
  'dusuk_guven',
  'tarama_hatasi',
  'yuksek_guven',
  'manuel_kontrol',
  'onay_bekliyor',
  'onaylandi',
  'gecersiz',
  'iletisim_istemiyor',
]);

/** GET /admin/contacts — butik + iletisim defteri birlesik liste */
adminContactRoutes.get(
  '/',
  zValidator(
    'query',
    z.object({
      country: z.string().length(2).optional(),
      status: durumSemasi.optional(),
    }),
  ),
  async (c) => {
    const market = await resolveMarket(c, c.req.valid('query').country);
    const istenenDurum = c.req.valid('query').status ?? 'hepsi';

    // Alan adini SQL'de degil kodda cikariyoruz: tek dogru kaynak alanAdiCikar().
    const butikler = await db
      .select({
        boutiqueId: boutiques.id,
        butikAdi: boutiques.name,
        url: boutiques.url,
        isActive: boutiques.isActive,
      })
      .from(boutiques)
      .where(and(eq(boutiques.countryCode, market), eq(boutiques.isActive, true)))
      .orderBy(asc(boutiques.name));

    const alanAdlari = [
      ...new Set(butikler.map((b) => alanAdiCikar(b.url)).filter((d): d is string => Boolean(d))),
    ];
    const defter =
      alanAdlari.length === 0
        ? []
        : await db.select().from(brandContacts).where(inArray(brandContacts.domain, alanAdlari));
    const defterHaritasi = new Map(defter.map((d) => [d.domain, d]));

    const satirlar = butikler.map((b) => {
      const domain = alanAdiCikar(b.url);
      const kayit = domain ? defterHaritasi.get(domain) : undefined;
      return {
        ...b,
        contactId: kayit?.id ?? null,
        domain: domain ?? null,
        email: kayit?.email ?? null,
        status: kayit?.status ?? null,
        doNotContact: kayit?.doNotContact ?? false,
        lastDiscoveryAt: kayit?.lastDiscoveryAt ?? null,
        lastDiscoveryError: kayit?.lastDiscoveryError ?? null,
      };
    });

    const contactIdler = satirlar.map((s) => s.contactId).filter((x): x is string => Boolean(x));
    const adaylar =
      contactIdler.length === 0
        ? []
        : await db
            .select()
            .from(contactCandidates)
            .where(inArray(contactCandidates.brandContactId, contactIdler));

    const adayHaritasi = new Map<string, typeof adaylar>();
    for (const aday of adaylar) {
      const liste = adayHaritasi.get(aday.brandContactId) ?? [];
      liste.push(aday);
      adayHaritasi.set(aday.brandContactId, liste);
    }

    // Tarama hatasi alan alan adlari (kuyrukta 'failed' kalmis isler)
    const hataliIsler = await db
      .select({ domain: contactDiscoveryJobs.domain })
      .from(contactDiscoveryJobs)
      .where(eq(contactDiscoveryJobs.status, 'failed'));
    const hataliAlanlar = new Set(hataliIsler.map((h) => h.domain));

    const tam = satirlar.map((s) => ({
      ...s,
      // Defterde satiri yoksa henuz hic taranmamis demektir
      status: s.doNotContact ? 'iletisim_istemiyor' : (s.status ?? 'taranmadi'),
      taramaHatasi: s.domain ? hataliAlanlar.has(s.domain) : false,
      adaylar: s.contactId ? (adayHaritasi.get(s.contactId) ?? []) : [],
    }));

    // Inceleme gruplari (yuksek guven / manuel kontrol / bulunamadi).
    // Karar duz kurallarla veriliyor; bkz. review-groups.ts. Hicbir adres
    // burada ONAYLANMAZ, yalnizca toplu onaya uygun olanlar isaretlenir.
    const gruplu = tam.map((s) => {
      // Henuz taranmamis satirlar hicbir gruba girmez
      if (s.status === 'taranmadi' && !s.taramaHatasi) {
        return { ...s, grup: null as string | null, grupGerekce: null as string | null };
      }
      const { grup, gerekce } = incelemeGrubu(s);
      return { ...s, grup, grupGerekce: gerekce };
    });

    // Secili (ya da onerilen) adres dusuk guvenli mi? Farkli domainli adresler
    // burada toplanir; sahip tek tek bakip karar verir.
    const dusukGuvenli = (s: (typeof gruplu)[number]) => {
      const secili = s.adaylar.find((a) => a.email === s.email) ?? s.adaylar[0];
      return Boolean(secili && secili.confidence === 'dusuk');
    };

    const suzulmus =
      istenenDurum === 'hepsi'
        ? gruplu
        : gruplu.filter((s) => {
            if (istenenDurum === 'bulundu') return s.adaylar.length > 0;
            if (istenenDurum === 'tarama_hatasi') return s.taramaHatasi;
            if (istenenDurum === 'dusuk_guven') return dusukGuvenli(s);
            if (istenenDurum === 'yuksek_guven') return s.grup === 'yuksek_guven';
            if (istenenDurum === 'manuel_kontrol') return s.grup === 'manuel_kontrol';
            return s.status === istenenDurum;
          });

    return c.json({
      market,
      sayimlar: {
        toplam: gruplu.length,
        taranmadi: gruplu.filter((s) => s.status === 'taranmadi').length,
        bulundu: gruplu.filter((s) => s.adaylar.length > 0).length,
        bulunamadi: gruplu.filter((s) => s.status === 'bulunamadi').length,
        onay_bekliyor: gruplu.filter((s) => s.status === 'onay_bekliyor').length,
        onaylandi: gruplu.filter((s) => s.status === 'onaylandi').length,
        gecersiz: gruplu.filter((s) => s.status === 'gecersiz').length,
        iletisim_istemiyor: gruplu.filter((s) => s.status === 'iletisim_istemiyor').length,
        dusuk_guven: gruplu.filter(dusukGuvenli).length,
        tarama_hatasi: gruplu.filter((s) => s.taramaHatasi).length,
        yuksek_guven: gruplu.filter((s) => s.grup === 'yuksek_guven').length,
        manuel_kontrol: gruplu.filter((s) => s.grup === 'manuel_kontrol').length,
      },
      butikler: suzulmus,
    });
  },
);

/** POST /admin/contacts/discover — secili butikler icin tarama (en fazla 10) */
adminContactRoutes.post(
  '/discover',
  zValidator(
    'json',
    z.object({
      boutiqueIds: z.array(z.string().uuid()).min(1).max(TEK_SEFERDE_MAKS_TARAMA),
    }),
  ),
  async (c) => {
    const { boutiqueIds } = c.req.valid('json');

    const hedefler = await db
      .select({ id: boutiques.id, name: boutiques.name, url: boutiques.url })
      .from(boutiques)
      .where(inArray(boutiques.id, boutiqueIds));

    const sonuclar: Array<{
      boutiqueId: string;
      domain: string;
      bulunan: number;
      hata: string | null;
    }> = [];
    // Sirali calisiyoruz: retailerFetch zaten origin basina bekletiyor, ayrica
    // ayni anda 10 siteye yuklenmek istemiyoruz.
    for (const hedef of hedefler) {
      const sonuc = await iletisimBilgisiAra(hedef.url);
      await taramaSonucunuKaydet(sonuc);
      sonuclar.push({
        boutiqueId: hedef.id,
        domain: sonuc.domain,
        bulunan: sonuc.adaylar.length,
        hata: sonuc.hata,
      });
    }

    return c.json({ sonuclar });
  },
);

/** PATCH /admin/contacts/:domain — sahibin karari */
adminContactRoutes.patch(
  '/:domain',
  zValidator(
    'json',
    z.object({
      action: z.enum(['onayla', 'degistir', 'gecersiz', 'iletisim_istemiyor', 'geri_al']),
      email: z.string().email().optional(),
      reason: z.string().max(500).optional(),
    }),
  ),
  async (c) => {
    const domain = c.req.param('domain').toLowerCase();
    const { action, email, reason } = c.req.valid('json');

    const [mevcut] = await db
      .select()
      .from(brandContacts)
      .where(eq(brandContacts.domain, domain))
      .limit(1);
    if (!mevcut) throw ApiError.notFound('bu alan adi icin kayit yok');

    const guncel: Partial<typeof brandContacts.$inferInsert> = { updatedAt: new Date() };

    if (action === 'onayla') {
      const secilen = email ?? mevcut.email;
      if (!secilen) throw ApiError.badRequest('email_required', 'onaylanacak adres yok');
      guncel.email = secilen;
      guncel.status = 'onaylandi';
    } else if (action === 'degistir') {
      if (!email) throw ApiError.badRequest('email_required', 'yeni adres gerekli');
      guncel.email = email;
      // Elle girilen adres de sahibin ayrica onaylamasini bekler
      guncel.status = 'onay_bekliyor';
    } else if (action === 'gecersiz') {
      guncel.status = 'gecersiz';
    } else if (action === 'iletisim_istemiyor') {
      guncel.doNotContact = true;
      guncel.doNotContactReason = reason ?? 'admin tarafindan isaretlendi';
    } else if (action === 'geri_al') {
      guncel.doNotContact = false;
      guncel.doNotContactReason = null;
      guncel.status = mevcut.email ? 'onay_bekliyor' : 'bulunamadi';
    }

    const [sonuc] = await db
      .update(brandContacts)
      .set(guncel)
      .where(eq(brandContacts.domain, domain))
      .returning();
    return c.json(sonuc);
  },
);

/** POST /admin/contacts/:domain/rediscover — tek butik icin tekrar ara */
adminContactRoutes.post('/:domain/rediscover', async (c) => {
  const domain = c.req.param('domain').toLowerCase();

  const adaylar = await db
    .select({ url: boutiques.url })
    .from(boutiques)
    .where(eq(boutiques.isActive, true));
  const butik = adaylar.find((b) => alanAdiCikar(b.url) === domain);

  const hedefUrl = butik?.url ?? `https://${domain}`;
  if (!alanAdiCikar(hedefUrl)) throw ApiError.badRequest('invalid_url', 'gecersiz adres');

  const sonuc = await iletisimBilgisiAra(hedefUrl);
  await taramaSonucunuKaydet(sonuc);
  return c.json({ domain: sonuc.domain, bulunan: sonuc.adaylar.length, hata: sonuc.hata });
});

// ————————————————————————————————————————————————————————————————
// TOPLU TARAMA
// Kuyruk (contact_discovery_jobs) + arka plan iscisi. Uclar yalnizca kuyrugu
// yonetir; taramayi isci yapar, boylece tarayici kapansa da is surer.
// ————————————————————————————————————————————————————————————————

/** Henuz hic taranmamis (defterde satiri olmayan) aktif butikler. */
async function taranmamisButikler(market: string) {
  const butikler = await db
    .select({ id: boutiques.id, url: boutiques.url })
    .from(boutiques)
    .where(and(eq(boutiques.countryCode, market), eq(boutiques.isActive, true)));

  const alanAdlari = [
    ...new Set(butikler.map((b) => alanAdiCikar(b.url)).filter((d): d is string => Boolean(d))),
  ];
  const defter =
    alanAdlari.length === 0
      ? []
      : await db
          .select({ domain: brandContacts.domain })
          .from(brandContacts)
          .where(inArray(brandContacts.domain, alanAdlari));
  const taranmis = new Set(defter.map((d) => d.domain));

  // Kuyrukta zaten bekleyen isleri de sayma
  const kuyruktakiler = await db
    .select({ domain: contactDiscoveryJobs.domain })
    .from(contactDiscoveryJobs)
    .where(inArray(contactDiscoveryJobs.status, ['pending', 'running', 'paused']));
  const kuyrukta = new Set(kuyruktakiler.map((k) => k.domain));

  return butikler
    .map((b) => ({ ...b, domain: alanAdiCikar(b.url) }))
    .filter(
      (b): b is { id: string; url: string; domain: string } =>
        Boolean(b.domain) && !taranmis.has(b.domain as string) && !kuyrukta.has(b.domain as string),
    );
}

/** GET /admin/contacts/bulk/preview — "kac butik taranacak?" */
adminContactRoutes.get('/bulk/preview', async (c) => {
  const market = await resolveMarket(c, c.req.query('country'));
  const hedefler = await taranmamisButikler(market);
  return c.json({ market, taranacak: hedefler.length });
});

/** POST /admin/contacts/bulk/start — kuyruga al. Tarama isci tarafindan yapilir. */
adminContactRoutes.post('/bulk/start', async (c) => {
  const market = await resolveMarket(c, c.req.query('country'));
  const hedefler = await taranmamisButikler(market);
  if (hedefler.length === 0) return c.json({ eklenen: 0 });

  const etiket = `toplu-${market}-${new Date().toISOString().slice(0, 10)}`;
  await db.insert(contactDiscoveryJobs).values(
    hedefler.map((h) => ({
      boutiqueId: h.id,
      domain: h.domain,
      url: h.url,
      batchLabel: etiket,
    })),
  );
  return c.json({ eklenen: hedefler.length, etiket });
});

/** POST /admin/contacts/bulk/pause — yeni is alinmasini durdurur. */
adminContactRoutes.post('/bulk/pause', async (c) => {
  const sonuc = await db
    .update(contactDiscoveryJobs)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(eq(contactDiscoveryJobs.status, 'pending'))
    .returning({ id: contactDiscoveryJobs.id });
  return c.json({ duraklatilan: sonuc.length });
});

/** POST /admin/contacts/bulk/resume */
adminContactRoutes.post('/bulk/resume', async (c) => {
  const sonuc = await db
    .update(contactDiscoveryJobs)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(eq(contactDiscoveryJobs.status, 'paused'))
    .returning({ id: contactDiscoveryJobs.id });
  return c.json({ devam_eden: sonuc.length });
});

/** POST /admin/contacts/bulk/retry-failed — hatali isleri yeniden kuyruga koy. */
adminContactRoutes.post('/bulk/retry-failed', async (c) => {
  const sonuc = await db
    .update(contactDiscoveryJobs)
    .set({ status: 'pending', attempts: 0, nextAttemptAt: new Date(), updatedAt: new Date() })
    .where(eq(contactDiscoveryJobs.status, 'failed'))
    .returning({ id: contactDiscoveryJobs.id });
  return c.json({ kuyruga_alinan: sonuc.length });
});

/** GET /admin/contacts/bulk/status — ilerleme. Sayfa yenilense de kaybolmaz. */
adminContactRoutes.get('/bulk/status', async (c) => {
  const satirlar = await db
    .select({
      status: contactDiscoveryJobs.status,
      adet: sql<number>`count(*)::int`,
      bulunan: sql<number>`coalesce(sum(case when ${contactDiscoveryJobs.foundCount} > 0 then 1 else 0 end), 0)::int`,
      bulunamayan: sql<number>`coalesce(sum(case when ${contactDiscoveryJobs.foundCount} = 0 then 1 else 0 end), 0)::int`,
    })
    .from(contactDiscoveryJobs)
    .groupBy(contactDiscoveryJobs.status);

  const say = (durum: string) => satirlar.find((s) => s.status === durum)?.adet ?? 0;
  const tamamlanan = say('done');
  const hatali = say('failed');
  const bekleyen = say('pending');
  const calisan = say('running');
  const duraklatilan = say('paused');
  const toplam = tamamlanan + hatali + bekleyen + calisan + duraklatilan;

  const bitmis = satirlar.filter((s) => s.status === 'done');
  return c.json({
    toplam,
    tamamlanan,
    bekleyen,
    calisan,
    duraklatilan,
    hatali,
    eposta_bulundu: bitmis.reduce((t, s) => t + s.bulunan, 0),
    eposta_bulunamadi: bitmis.reduce((t, s) => t + s.bulunamayan, 0),
    durum:
      duraklatilan > 0 && bekleyen === 0
        ? 'duraklatildi'
        : bekleyen + calisan > 0
          ? 'calisiyor'
          : 'bosta',
  });
});

/**
 * POST /admin/contacts/bulk-approve — secili adresleri ONAYLAR.
 *
 * GUVENLIK: istemciden gelen listeye guvenilmez. Her alan adi sunucuda
 * yeniden degerlendirilir; yalnizca o anda gercekten "yuksek guven" grubunda
 * olanlar onaylanir. Digerleri atlanir ve sebebiyle birlikte geri bildirilir.
 *
 * Onaylamak MAIL GONDERMEZ. Yalnizca adresi ileride gonderime uygun hale getirir.
 */
adminContactRoutes.post(
  '/bulk-approve',
  zValidator(
    'json',
    z.object({
      // Bos birakilirsa: pazardaki TUM yuksek guvenli kayitlar (sahip
      // "filtredeki hepsini sec" dediginde). Yine de her biri tek tek denetlenir.
      domains: z.array(z.string().min(3)).max(2000).optional(),
      country: z.string().length(2).optional(),
      tumu: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const { domains, country, tumu } = c.req.valid('json');
    if (!tumu && (!domains || domains.length === 0)) {
      throw ApiError.badRequest('secim_yok', 'onaylanacak kayit secilmedi');
    }
    const market = await resolveMarket(c, country);

    // Butik + defter + adaylari topla (liste ucuyla ayni kaynaklar)
    const butikler = await db
      .select({ url: boutiques.url })
      .from(boutiques)
      .where(and(eq(boutiques.countryCode, market), eq(boutiques.isActive, true)));
    const pazarAlanlari = new Set(
      butikler.map((b) => alanAdiCikar(b.url)).filter((d): d is string => Boolean(d)),
    );

    const istenen = tumu ? [...pazarAlanlari] : (domains ?? []).map((d) => d.toLowerCase());
    // Baska pazarin alan adi gonderilmesini engelle
    const hedefler = istenen.filter((d) => pazarAlanlari.has(d));
    if (hedefler.length === 0) return c.json({ onaylanan: 0, atlanan: 0, atlananlar: [] });

    const defter = await db
      .select()
      .from(brandContacts)
      .where(inArray(brandContacts.domain, hedefler));
    const adaylar = defter.length
      ? await db
          .select()
          .from(contactCandidates)
          .where(
            inArray(
              contactCandidates.brandContactId,
              defter.map((d) => d.id),
            ),
          )
      : [];
    const hataliIsler = await db
      .select({ domain: contactDiscoveryJobs.domain })
      .from(contactDiscoveryJobs)
      .where(eq(contactDiscoveryJobs.status, 'failed'));
    const hataliAlanlar = new Set(hataliIsler.map((h) => h.domain));

    const onaylanacak: string[] = [];
    const atlananlar: Array<{ domain: string; sebep: string }> = [];

    for (const kayit of defter) {
      const { grup, gerekce } = incelemeGrubu({
        domain: kayit.domain,
        email: kayit.email,
        status: kayit.status,
        doNotContact: kayit.doNotContact,
        taramaHatasi: hataliAlanlar.has(kayit.domain),
        adaylar: adaylar
          .filter((a) => a.brandContactId === kayit.id)
          .map((a) => ({ email: a.email, confidence: a.confidence, sourceUrl: a.sourceUrl })),
      });
      if (grup === 'yuksek_guven') onaylanacak.push(kayit.domain);
      else atlananlar.push({ domain: kayit.domain, sebep: gerekce ?? 'toplu onaya uygun değil' });
    }

    if (onaylanacak.length > 0) {
      await db
        .update(brandContacts)
        .set({ status: 'onaylandi', updatedAt: new Date() })
        .where(inArray(brandContacts.domain, onaylanacak));
    }

    return c.json({
      onaylanan: onaylanacak.length,
      atlanan: atlananlar.length,
      atlananlar: atlananlar.slice(0, 20),
    });
  },
);
