import { randomBytes } from 'node:crypto';
import { baglantiDavetleri, baglantiUrunleri, boutiques, butikBaglantilari } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '../env';
import { ikasIstemci, ikasKimligi } from '../lib/baglanti/ikas/ikas-istemci';
import { IkasSorguHatasi, type IkasTokenlari, ikasOAuth } from '../lib/baglanti/ikas/ikas-oauth';
import { kurulumSayfasi } from '../lib/baglanti/katilim-sayfalari';
import { KATILIM_SARTLARI_SURUMU, magazaAdiSchema } from '../lib/baglanti/kurallar';
import { yetkiAdresi as shopifyYetkiAdresi } from '../lib/baglanti/shopify/shopify-oauth';
import { shopifyUygulamasi } from '../lib/baglanti/shopify/shopify-uygulamalari';
import {
  SIPARIS_BILDIRIM_KAPSAMLARI,
  siparisBildiriminiIsle,
  siparisBildirimleriniKaydet,
} from '../lib/baglanti/siparis-isle';
import { baglantiyiEsitle } from '../lib/baglanti/urun-esitleme';
import { db } from '../lib/db';
import { ApiError } from '../lib/errors';
import { logger } from '../lib/logger';
import { sifrele } from '../lib/sifreleme';
import { DURUM_SURESI_MS, hosGeldinGonder, katilimBagimliliklari, vtHatasi } from './katilim-ortak';
import { katilimShopifyRoutes } from './katilim-shopify';

// Butik katılımı: davet linki → şart onayı → ikas izin ekranı → geri dönüş.
// Shopify yolları katilim-shopify.ts'de.
// Butik hiçbir anahtar kopyalamaz. Token'lar yalnız şifreli saklanır; loga,
// yanıta ya da yönlendirme adresine yazılmaz.

export const katilimRoutes = new Hono();

/** Testler sahte ikas/Shopify/Brevo verir. */
export { katilimBagimliliklari };

const KOMISYON_ORANI_YUZDE = 10;
const onaySchema = z.object({
  kabul: z.literal(true),
  onaylayanAd: z.string().trim().min(2).max(120),
  iletisimEposta: z.string().trim().email().max(200),
  magazaAdi: magazaAdiSchema.optional(),
});

/** Admin yazdıysa (ya da kaynak bilinmiyorsa) butik değiştiremez; butiğin yazdığı ad düzeltilebilir. */
const magazaAdiSabit = (d: { magazaAdi: string | null; magazaAdiKaynak: string | null }) =>
  !!d.magazaAdi && d.magazaAdiKaynak !== 'butik';

/** Kullanılabilir (kullanılmamış, iptal edilmemiş) davet. */
async function davetBul(token: string) {
  const [d] = await db
    .select({ davet: baglantiDavetleri, butikAdi: boutiques.name })
    .from(baglantiDavetleri)
    .innerJoin(boutiques, eq(boutiques.id, baglantiDavetleri.boutiqueId))
    .where(
      and(
        eq(baglantiDavetleri.token, token),
        isNull(baglantiDavetleri.kullanildiAt),
        isNull(baglantiDavetleri.iptalAt),
      ),
    )
    .limit(1);
  return d ?? null;
}

// Bağlantı ayarları (ikas anahtarı, şifreleme anahtarı) eksikse API açılır ama bağlantı
// kurulamaz: ikas yolları ve onay 503 döner.
const BAGLANTI_KAPALI = { hata: 'baglanti_kapali' } as const;

// --- ikas yolları `/:token`'dan önce: "ikas" hiçbir zaman davet sayılmasın.

katilimRoutes.use('/ikas/*', async (c, next) => {
  if (env.BAGLANTI_KULLANILABILIR) return next();
  if (c.req.method === 'GET' && c.req.path.endsWith('/ikas/kurulum'))
    return c.html(kurulumSayfasi('kullanilamiyor'), 503);
  // Butik tarayıcıdadır: katılım sayfası "yeniden deneyin" der.
  if (c.req.method === 'GET' && c.req.path.endsWith('/ikas/geri-donus'))
    return c.redirect(`${env.KATILIM_SAYFASI_URL}?hata=gecici`, 302);
  return c.json(BAGLANTI_KAPALI, 503);
});

/** ikas izin ekranından dönüş. Butik tarayıcıdadır: her durumda katılım sayfasına yönlendirilir. */
katilimRoutes.get('/ikas/geri-donus', async (c) => {
  const yonlendir = (hata?: string) => {
    const adres = hata
      ? `${env.KATILIM_SAYFASI_URL}?hata=${hata}`
      : new URL('tamam/', env.KATILIM_SAYFASI_URL).toString();
    return c.redirect(adres, 302);
  };
  const { code, storeName, state, signature, error } = c.req.query();

  if (error) return yonlendir('izin_verilmedi');
  // ikas kendi başlattığı akışta imza göndermeyebilir; gelirse doğrulanır.
  if (signature !== undefined && !(code && ikasOAuth.kodImzasiGecerli(code, signature))) {
    return yonlendir('gecersiz');
  }
  // ikas panelinden doğrudan "Uygulama Kur": davetsiz bağlantı kurulmaz.
  if (!state) return yonlendir('davet_gerekli');

  const [davet] = await db
    .select()
    .from(baglantiDavetleri)
    .where(eq(baglantiDavetleri.durumAnahtari, state))
    .limit(1);
  if (
    !davet ||
    davet.kullanildiAt ||
    davet.iptalAt ||
    !davet.durumAt ||
    Date.now() - davet.durumAt.getTime() > DURUM_SURESI_MS ||
    !davet.magazaAdi ||
    !davet.onaylayanAd ||
    !davet.iletisimEposta ||
    !davet.sartlarSurumu ||
    !davet.onayAt
  ) {
    return yonlendir('suresi_doldu');
  }
  if (storeName !== davet.magazaAdi) return yonlendir('magaza_uyusmuyor');
  if (!code) return yonlendir('gecersiz');
  if (!env.IKAS_CLIENT_ID || !env.IKAS_CLIENT_SECRET || !env.BAGLANTI_SIFRELEME_ANAHTARI) {
    logger.error('katilim: ikas ya da şifreleme ayarı eksik');
    return yonlendir('gecici');
  }

  const magazaAdi = davet.magazaAdi;
  let tokenlar: IkasTokenlari;
  let kimlik: Awaited<ReturnType<typeof ikasKimligi>>;
  try {
    tokenlar = await ikasOAuth.koduTokenaCevir(magazaAdi, code, katilimBagimliliklari.fetchFn);
    const ist = ikasIstemci(
      {
        magazaAdi,
        tokenlar,
        tokenlarDegisti: async (t) => {
          tokenlar = t;
        },
      },
      katilimBagimliliklari.fetchFn,
    );
    kimlik = await ikasKimligi(ist);
  } catch (e) {
    // Hata adı yeterli; mesajda token olmaz ama yine de yazılmaz.
    const ad = e instanceof Error ? e.name : 'bilinmeyen';
    logger.warn({ davetId: davet.id, hata: ad }, 'katilim: ikas bağlantısı kurulamadı');
    // Geçici (ağ/5xx) hatada davet ve state yeniden denenebilir kalır.
    return yonlendir(e instanceof IkasSorguHatasi ? 'gecici' : 'gecersiz');
  }
  if (kimlik.storeAppId !== env.IKAS_CLIENT_ID || kimlik.deleted) {
    logger.warn({ davetId: davet.id }, 'katilim: ikas uygulama kimliği uyuşmadı');
    return yonlendir('gecersiz');
  }

  const kimlikSifreli = sifrele(JSON.stringify(tokenlar), env.BAGLANTI_SIFRELEME_ANAHTARI);
  const onay = {
    onaylayanAd: davet.onaylayanAd,
    iletisimEposta: davet.iletisimEposta,
    sartlarSurumu: davet.sartlarSurumu,
    onayAt: davet.onayAt,
  };
  let kuruldu: boolean;
  let yeniBaglantiId: string | null = null;
  try {
    kuruldu = await db.transaction(async (tx) => {
      // Aynı state ile eşzamanlı ikinci dönüş ya da bu arada yeni POST (yeni state) burada elenir.
      const [kullanilan] = await tx
        .update(baglantiDavetleri)
        .set({ kullanildiAt: new Date() })
        .where(
          and(
            eq(baglantiDavetleri.id, davet.id),
            eq(baglantiDavetleri.durumAnahtari, state),
            gt(baglantiDavetleri.durumAt, new Date(Date.now() - DURUM_SURESI_MS)),
            isNull(baglantiDavetleri.kullanildiAt),
            isNull(baglantiDavetleri.iptalAt),
          ),
        )
        .returning({ id: baglantiDavetleri.id });
      if (!kullanilan) return false;
      const alanlar = {
        platform: 'ikas',
        magazaAdi,
        kimlikSifreli,
        durum: 'aktif',
        tahsilat: 'deneme',
        sonHata: null,
        ikasYetkiliUygulamaId: kimlik.authorizedAppId,
        ikasMerchantId: kimlik.merchantId,
        baglandiAt: new Date(),
        ...onay,
      };
      const [baglanti] = await tx
        .insert(butikBaglantilari)
        .values({ boutiqueId: davet.boutiqueId, ...alanlar })
        .onConflictDoUpdate({
          target: butikBaglantilari.boutiqueId,
          // Yeniden bağlanma: sipariş taraması kapalı dönemi taramaz, bağlanma anından sürer.
          set: { ...alanlar, sonSiparisTaramaAt: alanlar.baglandiAt, updatedAt: new Date() },
        })
        .returning({ id: butikBaglantilari.id });
      yeniBaglantiId = baglanti?.id ?? null;
      return true;
    });
  } catch (e) {
    // Ör. bu ikas uygulaması başka bir butiğe bağlı (ikasYetkiliUygulamaId tekil).
    logger.error({ davetId: davet.id, ...vtHatasi(e) }, 'katilim: bağlantı kaydedilemedi');
    return yonlendir('gecersiz');
  }
  if (!kuruldu) return yonlendir('suresi_doldu');

  // İlk ürün eşitlemesi ve sipariş bildirimi kaydı arka planda; yönlendirmeyi hiçbir durumda etkilemez.
  if (yeniBaglantiId) {
    void baglantiyiEsitle(yeniBaglantiId, { fetchFn: katilimBagimliliklari.fetchFn }).catch((e) =>
      logger.error(
        { davetId: davet.id, hata: String(e).slice(0, 200) },
        'katilim: ilk esitleme basarisiz',
      ),
    );
    void siparisBildirimleriniKaydet(yeniBaglantiId, katilimBagimliliklari.fetchFn);
  }

  await hosGeldinGonder(davet, onay.iletisimEposta, 'ikas');
  return yonlendir();
});

/** ikas paneli › Uygulamalar › Butika (iframe). İçerik her durumda gösterilir. */
katilimRoutes.get('/ikas/kurulum', async (c) => {
  const { storeName, merchantId, timestamp, signature } = c.req.query();
  const gecerli =
    !!storeName &&
    !!merchantId &&
    !!timestamp &&
    !!signature &&
    ikasOAuth.kurulumImzasiGecerli({ storeName, merchantId, timestamp, signature });
  if (!gecerli) return c.html(kurulumSayfasi('gecersiz'), 400);

  // Yalnız imzalı alanla aranır (authorizedAppId imzanın dışında).
  const [b] = await db
    .select({ id: butikBaglantilari.id })
    .from(butikBaglantilari)
    .where(
      and(eq(butikBaglantilari.ikasMerchantId, merchantId), eq(butikBaglantilari.durum, 'aktif')),
    )
    .limit(1);
  const bagli = !!b;
  return c.html(kurulumSayfasi(bagli ? 'bagli' : 'bagli_degil'));
});

const bildirimSchema = z.object({
  id: z.string().optional(),
  createdAt: z.union([z.string(), z.number()]).optional(),
  scope: z.string(),
  merchantId: z.string().optional(),
  authorizedAppId: z.string().optional(),
  data: z.string(),
  signature: z.string(),
});

/** İmzalı `data` bir JSON nesnesi olmalı; değilse (ör. geri dönüşteki imzalı `code`) null. */
function imzaliVeri(data: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(data);
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * ikas webhook adresi (tek uç): uygulama kaldırma ve sipariş oluşturma/güncelleme işlenir.
 * İmza yalnız `data`'yı kapsar ve geri dönüş `code` imzasıyla aynı anahtarı kullanır;
 * bu yüzden `data` nesne olmalı ve içindeki kimlikler dıştakilerle aynı olmalı.
 */
katilimRoutes.post('/ikas/bildirim', async (c) => {
  if (!env.IKAS_CLIENT_SECRET) {
    logger.error('katilim: IKAS_CLIENT_SECRET yok, bildirim doğrulanamaz');
    return c.json({ hata: 'yapilandirma' }, 500);
  }
  const ham = await c.req.json().catch(() => null);
  const ayrisan = bildirimSchema.safeParse(ham);
  if (!ayrisan.success) return c.json({ hata: 'gecersiz_istek' }, 400);
  const b = ayrisan.data;
  if (!ikasOAuth.veriImzasiGecerli(b.data, b.signature)) return c.json({ hata: 'imza' }, 401);
  const veri = imzaliVeri(b.data);
  if (!veri) return c.json({ hata: 'imza' }, 401);
  for (const alan of ['scope', 'authorizedAppId', 'merchantId'] as const) {
    if (alan in veri && veri[alan] !== b[alan]) return c.json({ hata: 'imza' }, 401);
  }

  const siparisBildirimi = SIPARIS_BILDIRIM_KAPSAMLARI.includes(b.scope);
  if (b.scope !== 'store/app/deleted' && !siparisBildirimi) return c.json({ ok: true });
  const yetkiliUygulamaId = b.authorizedAppId;
  if (!yetkiliUygulamaId) {
    // Mağaza başına kaydedilen bildirimlerde bu alan yoksa canlı kayıtta görünsün (yalnız kapsam).
    if (siparisBildirimi)
      logger.warn(
        { scope: b.scope },
        'katilim: sipariş bildiriminde authorizedAppId yok, yok sayıldı',
      );
    return c.json({ ok: true });
  }
  // ikas'ın biçimi doğrulanmadı: ISO dizge ya da epoch; 1e12'den küçük sayı saniye kabul edilir.
  const olusma =
    b.createdAt === undefined
      ? Number.NaN
      : typeof b.createdAt === 'number' && b.createdAt < 1e12
        ? b.createdAt * 1000
        : new Date(b.createdAt).getTime();

  if (siparisBildirimi) {
    // İmzalı veriden yalnız sipariş kimliği alınır; sipariş ikas'tan yeniden okunur.
    const siparisId = typeof veri.id === 'string' && veri.id ? veri.id : null;
    if (!siparisId) return c.json({ ok: true });
    const [baglanti] = await db
      .select({
        id: butikBaglantilari.id,
        durum: butikBaglantilari.durum,
        ikasMerchantId: butikBaglantilari.ikasMerchantId,
        baglandiAt: butikBaglantilari.baglandiAt,
      })
      .from(butikBaglantilari)
      .where(eq(butikBaglantilari.ikasYetkiliUygulamaId, yetkiliUygulamaId))
      .limit(1);
    if (!baglanti || baglanti.durum !== 'aktif') return c.json({ ok: true });
    if (!baglanti.ikasMerchantId || baglanti.ikasMerchantId !== b.merchantId) {
      logger.warn({ baglantiId: baglanti.id }, 'katilim: sipariş bildirimi mağazası uyuşmadı');
      return c.json({ ok: true });
    }
    // Yeniden bağlanmadan önceki bildirim yok sayılır. Tarihsiz olan işlenir: sipariş zaten
    // ikas'tan bu bağlantının yetkisiyle okunur.
    if (Number.isFinite(olusma) && baglanti.baglandiAt && olusma < baglanti.baglandiAt.getTime()) {
      return c.json({ ok: true });
    }
    try {
      await siparisBildiriminiIsle(baglanti.id, siparisId, katilimBagimliliklari.fetchFn);
    } catch (e) {
      logger.error(
        {
          baglantiId: baglanti.id,
          hata: e instanceof Error ? e.message.slice(0, 200) : 'bilinmeyen',
        },
        'katilim: sipariş bildirimi işlenemedi',
      );
      return c.json({ hata: 'islenemedi' }, 500);
    }
    return c.json({ ok: true });
  }

  await db.transaction(async (tx) => {
    const [baglanti] = await tx
      .select({
        id: butikBaglantilari.id,
        durum: butikBaglantilari.durum,
        kimlikSifreli: butikBaglantilari.kimlikSifreli,
        ikasMerchantId: butikBaglantilari.ikasMerchantId,
        baglandiAt: butikBaglantilari.baglandiAt,
      })
      .from(butikBaglantilari)
      .where(eq(butikBaglantilari.ikasYetkiliUygulamaId, yetkiliUygulamaId))
      .limit(1);
    // Bilinmeyen ya da zaten kapalı: ikas yeniden gönderebilir, değişiklik yapılmaz.
    if (!baglanti || (baglanti.durum === 'kapali' && baglanti.kimlikSifreli === '')) return;
    if (!baglanti.ikasMerchantId || baglanti.ikasMerchantId !== b.merchantId) {
      logger.warn(
        { baglantiId: baglanti.id },
        'katilim: bildirim mağaza kimliği uyuşmadı, yok sayıldı',
      );
      return;
    }
    // Son (yeniden) bağlanmadan önceki bildirim eskidir; yeni bağlantıyı kapatmaz.
    if (
      !Number.isFinite(olusma) ||
      (baglanti.baglandiAt && olusma < baglanti.baglandiAt.getTime())
    ) {
      logger.warn({ baglantiId: baglanti.id }, 'katilim: eski ya da tarihsiz bildirim yok sayıldı');
      return;
    }
    // Token yerelde öldürülür; ürünler Butika'dan kalkar.
    await tx
      .update(butikBaglantilari)
      .set({ durum: 'kapali', kimlikSifreli: '', updatedAt: new Date() })
      .where(eq(butikBaglantilari.id, baglanti.id));
    await tx
      .update(baglantiUrunleri)
      .set({ aktif: false })
      .where(eq(baglantiUrunleri.baglantiId, baglanti.id));
    logger.info(
      { baglantiId: baglanti.id },
      'katilim: ikas uygulaması kaldırıldı, bağlantı kapandı',
    );
  });
  return c.json({ ok: true });
});

// --- Shopify yolları da `/:token`'dan önce.
katilimRoutes.route('/shopify', katilimShopifyRoutes);

// --- Davet linki (katılım sayfası bunu çağırır)

katilimRoutes.get('/:token', async (c) => {
  const d = await davetBul(c.req.param('token'));
  if (!d) throw ApiError.notFound('davet bulunamadi');
  return c.json({
    butikAdi: d.butikAdi,
    platform: d.davet.platform,
    sartlarSurumu: KATILIM_SARTLARI_SURUMU,
    komisyonOrani: KOMISYON_ORANI_YUZDE,
    // Yalnız admin'in yazdığı ad: sayfa bunu sormaz. Butiğin yazdığı ad yeniden sorulur.
    magazaAdi: magazaAdiSabit(d.davet) ? d.davet.magazaAdi : null,
  });
});

katilimRoutes.post(
  '/:token',
  zValidator('json', onaySchema, (sonuc, c) => {
    if (!sonuc.success) return c.json({ hata: 'gecersiz_istek' }, 400);
  }),
  async (c) => {
    if (!env.BAGLANTI_KULLANILABILIR) return c.json(BAGLANTI_KAPALI, 503);
    const d = await davetBul(c.req.param('token'));
    if (!d) throw ApiError.notFound('davet bulunamadi');
    const body = c.req.valid('json');

    if (d.davet.platform === 'shopify') {
      // Shopify'da mağazayı admin yazar (uygulama anahtarı o mağazaya kayıtlı); butik değiştiremez.
      const magaza = d.davet.magazaAdi;
      if (!magaza) return c.json({ hata: 'magaza_adi_gerekli' }, 400);
      const uyg = await shopifyUygulamasi(magaza);
      if (!uyg) {
        logger.error({ davetId: d.davet.id }, 'katilim: shopify uygulama kaydı yok');
        return c.json(BAGLANTI_KAPALI, 503);
      }
      const durumAnahtari = randomBytes(32).toString('base64url');
      await db
        .update(baglantiDavetleri)
        .set({
          durumAnahtari,
          durumAt: new Date(),
          onaylayanAd: body.onaylayanAd,
          iletisimEposta: body.iletisimEposta,
          sartlarSurumu: KATILIM_SARTLARI_SURUMU,
          onayAt: new Date(),
        })
        .where(eq(baglantiDavetleri.id, d.davet.id));
      return c.json({ yetkiAdresi: shopifyYetkiAdresi(magaza, uyg.clientId, durumAnahtari) });
    }

    // Admin yazdıysa o geçerli; değilse butiğin yeni yazdığı ad öncekinin yerine geçer.
    const sabit = magazaAdiSabit(d.davet);
    const magazaAdi = sabit ? d.davet.magazaAdi : (body.magazaAdi ?? d.davet.magazaAdi);
    if (!magazaAdi) return c.json({ hata: 'magaza_adi_gerekli' }, 400);

    // Her istekte yeni state: önceki yetki adresi geçersiz olur.
    const durumAnahtari = randomBytes(32).toString('base64url');
    await db
      .update(baglantiDavetleri)
      .set({
        magazaAdi,
        magazaAdiKaynak: sabit ? (d.davet.magazaAdiKaynak ?? 'admin') : 'butik',
        durumAnahtari,
        durumAt: new Date(),
        onaylayanAd: body.onaylayanAd,
        iletisimEposta: body.iletisimEposta,
        sartlarSurumu: KATILIM_SARTLARI_SURUMU,
        onayAt: new Date(),
      })
      .where(eq(baglantiDavetleri.id, d.davet.id));
    return c.json({ yetkiAdresi: ikasOAuth.yetkiAdresi(magazaAdi, durumAnahtari) });
  },
);
