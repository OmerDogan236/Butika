import { baglantiUrunleri, butikBaglantilari } from '@butika/db';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { readIkasSelection } from '../price-tracking/ikas-stock';

export type BaglantiFiyati = { fiyatMinor: number; currency: string; stokta: boolean | null };
/**
 * `null`: bağlantı verisi kullanılır ama ürün bulunamadı (gözlem atlanır, siteye gidilmez).
 * `'kapsam_disi'`: aktif ve taze bağlantı verisi yok; fiyat her zamanki gibi siteden okunur.
 */
export type BaglantiSonucu = BaglantiFiyati | null | 'kapsam_disi';

/** Eşitleme 4 saatte bir; üç tur kaçarsa veri artık güncel sayılmaz. */
export const BAGLANTI_TAZELIK_MS = 12 * 3600_000;

// Sorgu, hash, www., host büyük/küçük harfi ve sondaki / farkı aynı ürünü değiştirmez.
function urlAnahtari(adres: string): string | null {
  try {
    const url = new URL(adres);
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

const likeKacis = (deger: string) => deger.replace(/[\\%_]/g, (k) => `\\${k}`);

/**
 * Kayıtlı ürün adresini butiğin aktif bağlantısından eşitlenen ürünlerle eşleştirir.
 * Seçili beden (`_butika_variant=ikas:<ürün>:<varyant>`) varyant satırıyla; seçim yoksa
 * ürün düzeyi satırla, o yoksa aynı ürünün tüm varyantlarından: en düşük satış fiyatı
 * (indirimli varsa o), herhangi bir beden stoktaysa stokta. Belirsizse null.
 * Bağlantı aktif değilse, son eşitleme ya da eşleşen satır 12 saatten eskiyse 'kapsam_disi'.
 */
export async function baglantiFiyatiBul(boutiqueId: string, url: string, simdi: Date = new Date()): Promise<BaglantiSonucu> {
  const tazelikSiniri = new Date(simdi.getTime() - BAGLANTI_TAZELIK_MS);
  const [baglanti] = await db.select({ sonUrunEsitlemeAt: butikBaglantilari.sonUrunEsitlemeAt })
    .from(butikBaglantilari)
    .where(and(eq(butikBaglantilari.boutiqueId, boutiqueId), eq(butikBaglantilari.durum, 'aktif'))).limit(1);
  if (!baglanti?.sonUrunEsitlemeAt || baglanti.sonUrunEsitlemeAt < tazelikSiniri) return 'kapsam_disi';

  let secim: ReturnType<typeof readIkasSelection>;
  let secimVar: boolean;
  try {
    secimVar = new URL(url).searchParams.has('_butika_variant');
    secim = readIkasSelection(url);
  } catch {
    return null;
  }
  // Tanınmayan ya da bozuk beden seçimi genel ürün fiyatına düşmez.
  if (secimVar && !secim?.variantId) return null;
  const anahtar = urlAnahtari(url);
  if (!anahtar) return null;
  const yol = new URL(url).pathname.replace(/\/+$/, '');

  const adaylar = await db.select({
    url: baglantiUrunleri.url, disUrunId: baglantiUrunleri.disUrunId, disVaryantId: baglantiUrunleri.disVaryantId,
    fiyatMinor: baglantiUrunleri.fiyatMinor, indirimliFiyatMinor: baglantiUrunleri.indirimliFiyatMinor,
    currency: baglantiUrunleri.currency, stokta: baglantiUrunleri.stokta, sonGorulmeAt: baglantiUrunleri.sonGorulmeAt,
  }).from(baglantiUrunleri)
    .innerJoin(butikBaglantilari, eq(butikBaglantilari.id, baglantiUrunleri.baglantiId))
    .where(and(
      eq(baglantiUrunleri.boutiqueId, boutiqueId), eq(butikBaglantilari.boutiqueId, boutiqueId),
      eq(butikBaglantilari.durum, 'aktif'), eq(baglantiUrunleri.aktif, true),
      sql`${baglantiUrunleri.url} ilike ${`%${likeKacis(yol)}%`}`,
      ...(secim?.variantId ? [eq(baglantiUrunleri.disVaryantId, secim.variantId)] : []),
    ));
  const ayniAdres = adaylar.filter((satir) => urlAnahtari(satir.url) === anahtar);

  let secilen: typeof ayniAdres;
  if (secim?.variantId) {
    const eslesen = ayniAdres.filter((s) => !s.disUrunId || s.disUrunId === secim.productId);
    secilen = eslesen.length === 1 ? eslesen : [];
  } else {
    const urunDuzeyi = ayniAdres.filter((s) => s.disVaryantId === null);
    const varyantlar = ayniAdres.filter((s) => s.disVaryantId !== null);
    // Aynı adreste iki farklı ürün varsa hangisi olduğu belli değil.
    const tekUrun = new Set(varyantlar.map((s) => s.disUrunId)).size === 1;
    secilen = urunDuzeyi.length === 1 ? urunDuzeyi : urunDuzeyi.length === 0 && tekUrun ? varyantlar : [];
  }
  if (!secilen.length) return null;
  if (secilen.some((s) => s.sonGorulmeAt < tazelikSiniri)) return 'kapsam_disi';

  const fiyatlar = secilen.map((s) => ({
    fiyatMinor: s.indirimliFiyatMinor ?? s.fiyatMinor,
    currency: s.currency?.trim().toUpperCase(),
  }));
  const currency = fiyatlar[0]!.currency;
  if (!currency || fiyatlar.some((f) => f.currency !== currency || f.fiyatMinor === null || f.fiyatMinor <= 0)) return null;
  const fiyatMinor = Math.min(...fiyatlar.map((f) => f.fiyatMinor as number));
  const stokta = secilen.some((s) => s.stokta === true) ? true : secilen.every((s) => s.stokta === false) ? false : null;
  return { fiyatMinor, currency, stokta };
}
