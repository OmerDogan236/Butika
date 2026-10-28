import { baglantiDavetleri, butikBaglantilari } from '@butika/db';
import { and, desc, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { env } from '../env';
import { kurulumSayfasi } from '../lib/baglanti/katilim-sayfalari';
import {
  ShopifySorguHatasi,
  type ShopifyTokenlari,
  koduTokenaCevir,
  shopifyMagazaAdi,
  sorguImzasiGecerli,
  yetkiAdresi,
} from '../lib/baglanti/shopify/shopify-oauth';
import { shopifyUygulamasi } from '../lib/baglanti/shopify/shopify-uygulamalari';
import {
  shopifyBildiriminiIsle,
  shopifyBildirimleriniKaydet,
} from '../lib/baglanti/shopify/shopify-webhook';
import { baglantiyiEsitle } from '../lib/baglanti/urun-esitleme';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { sifrele } from '../lib/sifreleme';
import {
  DURUM_SURESI_MS,
  davetHazirMi,
  hosGeldinGonder,
  katilimAdresi,
  katilimBagimliliklari,
  vtHatasi,
} from './katilim-ortak';

// Shopify katılımı: davet linki → şart onayı → Shopify izin ekranı → geri dönüş.
// Mağaza başına ayrı Partner uygulaması (özel dağıtım); anahtarını admin girer.
// Token'lar yalnız şifreli saklanır; loga, yanıta ya da yönlendirme adresine yazılmaz.

export const katilimShopifyRoutes = new Hono();

katilimShopifyRoutes.use('*', async (c, next) => {
  if (env.BAGLANTI_KULLANILABILIR) return next();
  if (c.req.path.endsWith('/shopify/uygulama'))
    return c.html(kurulumSayfasi('kullanilamiyor', 'shopify'), 503);
  // Bildirim: Shopify 2xx dışını yeniden dener.
  if (c.req.path.endsWith('/shopify/bildirim')) return c.json({ hata: 'baglanti_kapali' }, 503);
  return c.redirect(katilimAdresi('gecici'), 302);
});

/** İmzalı sorgunun en fazla bu kadar eski (ya da ileri) olmasına izin verilir: tekrar oynatma. */
export const SORGU_ZAMAN_SINIRI_SN = 300;

/** Testler saati değiştirebilir. */
export const shopifyKatilimSaati = { simdi: () => Date.now() };

/** `timestamp` (saniye) var, sayısal ve şimdiye 300 sn'den yakın mı. */
function sorguTaze(sorgu: URLSearchParams): boolean {
  const ham = sorgu.get('timestamp') ?? '';
  if (!/^\d{1,12}$/.test(ham)) return false;
  return Math.abs(shopifyKatilimSaati.simdi() / 1000 - Number(ham)) <= SORGU_ZAMAN_SINIRI_SN;
}

/**
 * Sorgunun `shop`'u ve o mağazanın kendi secret'ıyla imza doğrulaması, sonra zaman damgası.
 * Mağaza kayıtsız, biçim dışı, imza yanlış ya da sorgu bayatsa null.
 */
async function imzaliMagaza(sorgu: URLSearchParams) {
  const ham = sorgu.get('shop') ?? '';
  const magaza = shopifyMagazaAdi(ham);
  // İmza ham değeri kapsar; düzeltilmiş ad farklıysa kabul edilmez.
  if (!magaza || magaza !== ham) return null;
  const uyg = await shopifyUygulamasi(magaza);
  if (!uyg || !sorguImzasiGecerli(sorgu, uyg.secret)) return null;
  if (!sorguTaze(sorgu)) return null;
  return { magaza, uyg };
}

/** Shopify izin ekranından dönüş. Butik tarayıcıdadır: her durumda katılım sayfasına yönlendirilir. */
katilimShopifyRoutes.get('/geri-donus', async (c) => {
  const yonlendir = (hata?: string) => c.redirect(katilimAdresi(hata), 302);
  const sorgu = new URL(c.req.url).searchParams;

  let imzali: Awaited<ReturnType<typeof imzaliMagaza>>;
  try {
    imzali = await imzaliMagaza(sorgu);
  } catch (e) {
    // Ör. şifreleme anahtarı okunamadı. Hata adı yeterli.
    logger.error(
      { hata: e instanceof Error ? e.name : 'bilinmeyen' },
      'katilim: shopify anahtarı okunamadı',
    );
    return yonlendir('gecici');
  }
  if (!imzali) return yonlendir('gecersiz');
  const { magaza, uyg } = imzali;

  if (sorgu.get('error')) return yonlendir('izin_verilmedi');
  // Shopify panelinden davetsiz başlatılan akış: bağlantı kurulmaz.
  const state = sorgu.get('state');
  if (!state) return yonlendir('davet_gerekli');

  const [davet] = await db
    .select()
    .from(baglantiDavetleri)
    .where(eq(baglantiDavetleri.durumAnahtari, state))
    .limit(1);
  if (!davet || !davetHazirMi(davet)) return yonlendir('suresi_doldu');
  // Başka mağazanın (kendi secret'ıyla imzalı) dönüşü ya da ikas daveti.
  if (davet.platform !== 'shopify' || magaza !== davet.magazaAdi) {
    logger.warn({ davetId: davet.id }, 'katilim: shopify mağazası davetle uyuşmadı');
    return yonlendir('magaza_uyusmuyor');
  }
  const code = sorgu.get('code');
  if (!code) return yonlendir('gecersiz');
  if (!env.BAGLANTI_SIFRELEME_ANAHTARI) {
    logger.error('katilim: şifreleme ayarı eksik');
    return yonlendir('gecici');
  }

  let tokenlar: ShopifyTokenlari;
  try {
    tokenlar = await koduTokenaCevir(magaza, uyg, code, katilimBagimliliklari.fetchFn);
  } catch (e) {
    // Hata adı yeterli; mesajda token olmaz ama yine de yazılmaz.
    const ad = e instanceof Error ? e.name : 'bilinmeyen';
    logger.warn({ davetId: davet.id, hata: ad }, 'katilim: shopify bağlantısı kurulamadı');
    // Geçici (ağ/5xx) hatada davet ve state yeniden denenebilir kalır.
    return yonlendir(e instanceof ShopifySorguHatasi ? 'gecici' : 'gecersiz');
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
        platform: 'shopify',
        magazaAdi: magaza,
        kimlikSifreli,
        durum: 'aktif',
        tahsilat: 'deneme',
        sonHata: null,
        // Önceki ikas bağlantısından kalan kimlikler temizlenir.
        ikasYetkiliUygulamaId: null,
        ikasMerchantId: null,
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
    // Ör. bu mağaza başka bir butiğe bağlı (platform + mağaza tekil).
    logger.error(
      { davetId: davet.id, ...vtHatasi(e) },
      'katilim: shopify bağlantısı kaydedilemedi',
    );
    return yonlendir('gecersiz');
  }
  if (!kuruldu) return yonlendir('suresi_doldu');

  // İlk ürün eşitlemesi ve bildirim kaydı arka planda; yönlendirmeyi hiçbir durumda etkilemez.
  if (yeniBaglantiId) {
    void baglantiyiEsitle(yeniBaglantiId, { fetchFn: katilimBagimliliklari.fetchFn }).catch((e) =>
      logger.error(
        { davetId: davet.id, hata: String(e).slice(0, 200) },
        'katilim: ilk esitleme basarisiz',
      ),
    );
    void shopifyBildirimleriniKaydet(yeniBaglantiId, katilimBagimliliklari.fetchFn);
  }

  await hosGeldinGonder(davet, onay.iletisimEposta, 'shopify');
  return yonlendir();
});

/**
 * Partner'daki "App URL": Shopify paneli ve kurulum linki buraya açar (imzalı, kodsuz).
 * Kurulum linki önce açıldıysa bekleyen onaylı davetin yetki adresine yönlendirir;
 * uygulama zaten kurulu olduğundan Shopify izin ekranı göstermeden kodla geri döner.
 */
katilimShopifyRoutes.get('/uygulama', async (c) => {
  const sorgu = new URL(c.req.url).searchParams;
  let imzali: Awaited<ReturnType<typeof imzaliMagaza>>;
  try {
    imzali = await imzaliMagaza(sorgu);
  } catch (e) {
    logger.error(
      { hata: e instanceof Error ? e.name : 'bilinmeyen' },
      'katilim: shopify anahtarı okunamadı',
    );
    return c.html(kurulumSayfasi('kullanilamiyor', 'shopify'), 503);
  }
  if (!imzali) return c.html(kurulumSayfasi('gecersiz', 'shopify'), 400);
  const { magaza, uyg } = imzali;

  const [bagli] = await db
    .select({ id: butikBaglantilari.id })
    .from(butikBaglantilari)
    .where(
      and(
        eq(butikBaglantilari.platform, 'shopify'),
        eq(butikBaglantilari.magazaAdi, magaza),
        eq(butikBaglantilari.durum, 'aktif'),
      ),
    )
    .limit(1);
  if (bagli) return c.html(kurulumSayfasi('bagli', 'shopify'));

  const [bekleyen] = await db
    .select()
    .from(baglantiDavetleri)
    .where(
      and(
        eq(baglantiDavetleri.platform, 'shopify'),
        eq(baglantiDavetleri.magazaAdi, magaza),
        isNull(baglantiDavetleri.kullanildiAt),
        isNull(baglantiDavetleri.iptalAt),
        isNotNull(baglantiDavetleri.onayAt),
        isNotNull(baglantiDavetleri.durumAnahtari),
        gt(baglantiDavetleri.durumAt, new Date(Date.now() - DURUM_SURESI_MS)),
      ),
    )
    .orderBy(desc(baglantiDavetleri.durumAt))
    .limit(1);
  if (bekleyen?.durumAnahtari && davetHazirMi(bekleyen)) {
    return c.redirect(yetkiAdresi(magaza, uyg.clientId, bekleyen.durumAnahtari), 302);
  }
  return c.html(kurulumSayfasi('bagli_degil', 'shopify'));
});

/**
 * Shopify bildirim adresi (tek uç; sipariş, ürün, kaldırma ve gizlilik konuları). Ham gövde
 * JSON ayrıştırılmadan okunur, imza önce doğrulanır (mağazanın kendi secret'ı).
 */
katilimShopifyRoutes.post('/bildirim', async (c) => {
  const hamGovde = await c.req.text();
  const durum = await shopifyBildiriminiIsle(
    {
      magazaBasligi: c.req.header('x-shopify-shop-domain') ?? '',
      imza: c.req.header('x-shopify-hmac-sha256') ?? '',
      konu: c.req.header('x-shopify-topic') ?? '',
      hamGovde,
    },
    katilimBagimliliklari.fetchFn,
  );
  if (durum === 200) return c.json({ ok: true });
  const hata = { 400: 'gecersiz_istek', 401: 'imza', 500: 'islenemedi' }[durum];
  return c.json({ hata }, durum);
});
