import { baglantiUrunleri, butikBaglantilari, shopifyUygulamalari } from '@butika/db';
import { and, eq } from 'drizzle-orm';
import { env } from '../../../env';
import { db } from '../../db';
import { logger } from '../../logger';
import { coz } from '../../sifreleme';
import { shopifyBaglantiIstemcisi } from '../baglanti-istemcisi';
import { siparisBildiriminiIsle } from '../siparis-isle';
import { type ShopifyTokenlari, govdeImzasiGecerli, shopifyMagazaAdi } from './shopify-oauth';
import { shopifyUygulamasi } from './shopify-uygulamalari';

// Shopify bildirimleri (webhook): sipariş, ürün, uygulama kaldırma ve gizlilik istekleri.
// Gövdeden yalnız sipariş kimliği alınır; sipariş Shopify'dan yeniden okunur. Müşteri bilgisi
// (ad, e-posta, telefon, adres, IP) hiçbir yere yazılmaz ve loglanmaz.

/** Bağlantı kurulunca API'den kaydedilen konular. Gizlilik konuları toml'da (infra/shopify). */
export const SHOPIFY_BILDIRIM_KONULARI = [
  'ORDERS_CREATE',
  'ORDERS_UPDATED',
  'PRODUCTS_UPDATE',
  'PRODUCTS_DELETE',
  'APP_UNINSTALLED',
] as const;

const SIPARIS_KONULARI = new Set(['orders/create', 'orders/updated']);
const URUN_KONULARI = new Set(['products/update', 'products/delete']);
const GIZLILIK_KONULARI = new Set(['customers/data_request', 'customers/redact']);

const hataOzeti = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/** Shopify'ın "bu adres bu konu için zaten kayıtlı" hatası (yeniden bağlanma). */
const zatenKayitli = (mesaj: string) => /already been taken/i.test(mesaj);

/**
 * Bağlantının mağazasına sipariş/ürün/kaldırma bildirimlerini kaydeder (bağlantı kurulunca).
 * Adres https değilse (yerel) atlanır. Fırlatmaz; başarısızlık yalnız loglanır, saatlik
 * tarama ve eşitleme yine çalışır. Abonelik uygulamanın kendi kaydıdır, mağaza verisi değildir.
 */
export async function shopifyBildirimleriniKaydet(
  baglantiId: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  let uri: string;
  try {
    const u = new URL(env.SHOPIFY_YONLENDIRME_URL);
    if (u.protocol !== 'https:') return false;
    uri = `${u.origin}/katilim/shopify/bildirim`;
  } catch {
    return false;
  }
  try {
    const [b] = await db
      .select({
        id: butikBaglantilari.id,
        platform: butikBaglantilari.platform,
        magazaAdi: butikBaglantilari.magazaAdi,
        kimlikSifreli: butikBaglantilari.kimlikSifreli,
        durum: butikBaglantilari.durum,
      })
      .from(butikBaglantilari)
      .where(eq(butikBaglantilari.id, baglantiId));
    if (!b || b.platform !== 'shopify' || b.durum !== 'aktif') return false;
    const ist = await shopifyBaglantiIstemcisi(b, fetchFn);
    if (!ist) return false;
    // Beş konu tek istekte (takma adlarla).
    const tanimlar = SHOPIFY_BILDIRIM_KONULARI.map((_, i) => `$t${i}: WebhookSubscriptionTopic!`);
    const alanlar = SHOPIFY_BILDIRIM_KONULARI.map(
      (_, i) =>
        `k${i}: webhookSubscriptionCreate(topic: $t${i}, webhookSubscription: $abonelik) { webhookSubscription { id } userErrors { message } }`,
    );
    const degiskenler: Record<string, unknown> = { abonelik: { uri, format: 'JSON' } };
    SHOPIFY_BILDIRIM_KONULARI.forEach((k, i) => {
      degiskenler[`t${i}`] = k;
    });
    type Sonuc = {
      webhookSubscription?: { id: string } | null;
      userErrors?: { message?: string | null }[] | null;
    } | null;
    const d = await ist.sorgu<Record<string, Sonuc>>(
      `mutation (${tanimlar.join(', ')}, $abonelik: WebhookSubscriptionInput!) { ${alanlar.join(' ')} }`,
      degiskenler,
    );
    const eksik = SHOPIFY_BILDIRIM_KONULARI.filter((_, i) => {
      const s = d[`k${i}`];
      if (s?.webhookSubscription?.id) return false;
      const hatalar = s?.userErrors ?? [];
      return !(hatalar.length > 0 && hatalar.every((h) => zatenKayitli(h.message ?? '')));
    });
    if (eksik.length) {
      logger.warn({ baglantiId, eksik }, 'shopify: bildirim kaydı eksik döndü');
      return false;
    }
    return true;
  } catch (e) {
    logger.warn({ baglantiId, hata: hataOzeti(e) }, 'shopify: bildirim kaydı başarısız');
    return false;
  }
}

export type ShopifyBildirimi = {
  /** `X-Shopify-Shop-Domain` */
  magazaBasligi: string;
  /** `X-Shopify-Hmac-Sha256` */
  imza: string;
  /** `X-Shopify-Topic` */
  konu: string;
  /** Ham gövde; imza bunun üzerinde doğrulanır. */
  hamGovde: string;
};

/** Mağazanın Shopify bağlantısı (platform + mağaza tekil). */
async function magazaBaglantisi(magaza: string) {
  const [b] = await db
    .select({ id: butikBaglantilari.id, durum: butikBaglantilari.durum })
    .from(butikBaglantilari)
    .where(and(eq(butikBaglantilari.platform, 'shopify'), eq(butikBaglantilari.magazaAdi, magaza)))
    .limit(1);
  return b ?? null;
}

/** Gövdedeki sipariş kimliği (gid); yoksa null. */
function siparisKimligi(govde: Record<string, unknown>): string | null {
  const gid = govde.admin_graphql_api_id;
  if (typeof gid === 'string' && /^gid:\/\/shopify\/Order\/\d+$/.test(gid)) return gid;
  const id = govde.id;
  if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
    return `gid://shopify/Order/${id}`;
  if (typeof id === 'string' && /^\d+$/.test(id)) return `gid://shopify/Order/${id}`;
  return null;
}

/**
 * Bildirimi doğrular ve işler; HTTP durum kodunu döner. Önce imza (mağazanın kendi secret'ı,
 * ham gövde), sonra gövde ayrıştırılır. 401: mağaza/imza geçersiz. 500: geçici hata (Shopify
 * yeniden dener). Diğer her durumda 200.
 */
export async function shopifyBildiriminiIsle(
  b: ShopifyBildirimi,
  fetchFn: typeof fetch = fetch,
): Promise<200 | 400 | 401 | 500> {
  const magaza = shopifyMagazaAdi(b.magazaBasligi);
  // Düzeltilmiş ad başlıktan farklıysa kabul edilmez.
  if (!magaza || magaza !== b.magazaBasligi) return 401;
  let uyg: Awaited<ReturnType<typeof shopifyUygulamasi>>;
  try {
    uyg = await shopifyUygulamasi(magaza);
  } catch (e) {
    logger.error(
      { hata: e instanceof Error ? e.name : 'bilinmeyen' },
      'shopify: bildirim anahtarı okunamadı',
    );
    return 500;
  }
  if (!uyg || !govdeImzasiGecerli(b.hamGovde, b.imza, uyg.secret)) return 401;

  const konu = b.konu;

  // Müşteri gizlilik konuları imza geçerliyken gövdeye bakılmadan 200 döner (hiçbir şey yapmaz).
  if (GIZLILIK_KONULARI.has(konu)) {
    // Butika müşteri kişisel verisi tutmaz; silinecek/verilecek bir şey yok. Yalnız konu ve mağaza.
    logger.info({ konu, magaza }, 'shopify: gizlilik isteği alındı (müşteri verisi tutulmuyor)');
    return 200;
  }

  let govde: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(b.hamGovde);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return 400;
    govde = v as Record<string, unknown>;
  } catch {
    return 400;
  }

  // İmza yalnız gövdeyi kapsar, konu başlığı imzasızdır: başka konunun imzalı gövdesi bu
  // konularla gönderilebilir. Gövdedeki mağaza kimliği başlıktakiyle aynı olmalı, ayrıca
  // bağlantı ancak token iptali Shopify'da doğrulanınca kapanır.
  if (konu === 'app/uninstalled' || konu === 'shop/redact') {
    if (govdeMagazasi(konu, govde) !== magaza) return 401;
    return kapanisiIsle(magaza, konu, fetchFn);
  }

  if (SIPARIS_KONULARI.has(konu)) {
    const siparisId = siparisKimligi(govde);
    if (!siparisId) return 200;
    const baglanti = await magazaBaglantisi(magaza);
    if (!baglanti || baglanti.durum !== 'aktif') return 200;
    try {
      await siparisBildiriminiIsle(baglanti.id, siparisId, fetchFn);
    } catch (e) {
      logger.error(
        { baglantiId: baglanti.id, hata: hataOzeti(e) },
        'shopify: sipariş bildirimi işlenemedi',
      );
      return 500;
    }
    return 200;
  }

  if (URUN_KONULARI.has(konu)) {
    // Eşitleme işi sonUrunEsitlemeAt null olanı ilk sırada alır.
    await db
      .update(butikBaglantilari)
      .set({ sonUrunEsitlemeAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(butikBaglantilari.platform, 'shopify'),
          eq(butikBaglantilari.magazaAdi, magaza),
          eq(butikBaglantilari.durum, 'aktif'),
        ),
      );
    return 200;
  }

  return 200;
}

/** Kapanış konularında gövdedeki mağaza: shop/redact → shop_domain; app/uninstalled → mağaza nesnesi. */
function govdeMagazasi(konu: string, govde: Record<string, unknown>): string | null {
  const alan = (v: unknown) => (typeof v === 'string' ? v : null);
  if (konu === 'shop/redact') return alan(govde.shop_domain);
  const myshopify = alan(govde.myshopify_domain);
  if (myshopify) return myshopify;
  const domain = alan(govde.domain);
  return domain?.endsWith('.myshopify.com') ? domain : null;
}

export type IptalDurumu = 'iptal' | 'gecerli' | 'belirsiz';
const DOGRULAMA_ZAMAN_ASIMI_MS = 10_000;

/**
 * Kayıtlı erişim token'ı Shopify'da iptal mi? Tek ham istek (`{ shop { id } }`), yenileme YOK.
 * Yalnız HTTP 401 → 'iptal'; 200 → 'gecerli'. Token süresi dolmuşsa (istek gönderilmez), kimlik
 * okunamazsa, başka durum kodu ya da ağ hatası → 'belirsiz'.
 */
export async function tokenIptalMi(
  magaza: string,
  kimlikSifreli: string,
  fetchFn: typeof fetch = fetch,
): Promise<IptalDurumu> {
  const anahtar = env.BAGLANTI_SIFRELEME_ANAHTARI;
  if (!anahtar || !shopifyMagazaAdi(magaza)) return 'belirsiz';
  let tokenlar: ShopifyTokenlari;
  try {
    tokenlar = JSON.parse(coz(kimlikSifreli, anahtar)) as ShopifyTokenlari;
  } catch {
    return 'belirsiz';
  }
  if (!tokenlar.erisim) return 'belirsiz';
  if (tokenlar.bitisAt && new Date(tokenlar.bitisAt).getTime() <= Date.now()) return 'belirsiz';
  try {
    const res = await fetchFn(
      `https://${magaza}/admin/api/${env.SHOPIFY_API_SURUMU}/graphql.json`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-shopify-access-token': tokenlar.erisim },
        body: JSON.stringify({ query: '{ shop { id } }' }),
        signal: AbortSignal.timeout(DOGRULAMA_ZAMAN_ASIMI_MS),
      },
    );
    if (res.status === 401) return 'iptal';
    if (res.status === 200) return 'gecerli';
    return 'belirsiz';
  } catch {
    return 'belirsiz';
  }
}

/**
 * app/uninstalled ve shop/redact. Bağlantı canlıysa (kimliği var ve kapalı değil) yalnız token
 * iptali doğrulanınca işlenir: token çalışıyorsa hiçbir şey değişmez (200), doğrulanamazsa 500
 * (Shopify yeniden dener). Kapanış, doğrulanan kimlik hâlâ aynıysa yapılır; değilse (bu arada
 * yeniden bağlandı) 500.
 * - app/uninstalled: durum 'kapali', kimlik silinir, ürünler pasif (ikas kaldırmasıyla aynı).
 *   Bağlantı yok ya da zaten kapalıysa değişiklik yok.
 * - shop/redact: ayrıca ürün satırları ve uygulama anahtarı silinir; sipariş kayıtları kalır.
 */
async function kapanisiIsle(
  magaza: string,
  konu: 'app/uninstalled' | 'shop/redact',
  fetchFn: typeof fetch,
): Promise<200 | 500> {
  const [baglanti] = await db
    .select({
      id: butikBaglantilari.id,
      durum: butikBaglantilari.durum,
      kimlikSifreli: butikBaglantilari.kimlikSifreli,
    })
    .from(butikBaglantilari)
    .where(and(eq(butikBaglantilari.platform, 'shopify'), eq(butikBaglantilari.magazaAdi, magaza)))
    .limit(1);
  const canli = !!baglanti && baglanti.durum !== 'kapali' && baglanti.kimlikSifreli !== '';
  if (konu === 'app/uninstalled' && !canli) return 200;

  if (canli) {
    const durum = await tokenIptalMi(magaza, baglanti.kimlikSifreli, fetchFn);
    if (durum === 'gecerli') {
      // Uygulama kurulu: bildirim eski, tekrar oynatılmış ya da konusu değiştirilmiş.
      logger.warn({ konu, magaza }, 'shopify: token geçerli, kapanış bildirimi yok sayıldı');
      return 200;
    }
    if (durum === 'belirsiz') {
      logger.warn({ konu, magaza }, 'shopify: token iptali doğrulanamadı, yeniden denenecek');
      return 500;
    }
  }

  const sonuc = await db.transaction(async (tx) => {
    if (baglanti) {
      // Canlıysa doğrulanan kimlik değişmemiş olmalı (bu arada yeniden bağlanan kapanmaz).
      const [kapanan] = await tx
        .update(butikBaglantilari)
        .set({ durum: 'kapali', kimlikSifreli: '', updatedAt: new Date() })
        .where(
          and(
            eq(butikBaglantilari.id, baglanti.id),
            eq(butikBaglantilari.kimlikSifreli, baglanti.kimlikSifreli),
          ),
        )
        .returning({ id: butikBaglantilari.id });
      if (!kapanan) return 'degisti' as const;
      if (konu === 'shop/redact')
        await tx.delete(baglantiUrunleri).where(eq(baglantiUrunleri.baglantiId, baglanti.id));
      else
        await tx
          .update(baglantiUrunleri)
          .set({ aktif: false })
          .where(eq(baglantiUrunleri.baglantiId, baglanti.id));
    }
    if (konu === 'shop/redact')
      await tx.delete(shopifyUygulamalari).where(eq(shopifyUygulamalari.magaza, magaza));
    return 'tamam' as const;
  });
  if (sonuc === 'degisti') {
    logger.warn(
      { konu, magaza },
      'shopify: bağlantı doğrulama sırasında değişti, yeniden denenecek',
    );
    return 500;
  }
  logger.info(
    { konu, magaza },
    konu === 'shop/redact'
      ? 'shopify: mağaza verisi silindi'
      : 'shopify: uygulama kaldırıldı, bağlantı kapandı',
  );
  return 200;
}
