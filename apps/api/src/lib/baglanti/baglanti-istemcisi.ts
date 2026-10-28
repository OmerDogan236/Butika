import { baglantiUrunleri, butikBaglantilari } from '@butika/db';
import { and, eq, sql } from 'drizzle-orm';
import { env } from '../../env';
import { db } from '../db';
import { coz, sifrele } from '../sifreleme';
import { type Ikas, IkasYetkiHatasi, ikasIstemci } from './ikas/ikas-istemci';
import type { IkasTokenlari } from './ikas/ikas-oauth';
import { type NormalSiparis, ikasSiparisGetir, ikasSiparisleriniGetir } from './ikas/ikas-siparis';
import { type NormalUrun, ikasIadePolitikasiGetir, ikasUrunleriniGetir } from './ikas/ikas-urun';
import { type Shopify, ShopifyYetkiHatasi, shopifyIstemci } from './shopify/shopify-istemci';
import type { ShopifyTokenlari } from './shopify/shopify-oauth';
import { shopifySiparisGetir, shopifySiparisleriniGetir } from './shopify/shopify-siparis';
import { shopifyIadePolitikasiGetir, shopifyUrunleriniGetir } from './shopify/shopify-urun';
import { shopifyUygulamasi } from './shopify/shopify-uygulamalari';

export const KOPTU_HATASI = 'ikas_yetki_reddedildi';

/**
 * Bağlantı satırındaki şifreli token'larla ikas istemcisi. Yenilenen çift şifreli kaydedilir;
 * kaldırılmış (durum != aktif) bağlantıya yeniden yazılmaz. Kimlik okunamazsa null.
 */
export function baglantiIstemcisi(
  baglanti: { id: string; magazaAdi: string; kimlikSifreli: string },
  fetchFn: typeof fetch = fetch,
): Ikas | null {
  const anahtar = env.BAGLANTI_SIFRELEME_ANAHTARI;
  if (!anahtar || !baglanti.kimlikSifreli) return null;
  let tokenlar: IkasTokenlari;
  try {
    tokenlar = JSON.parse(coz(baglanti.kimlikSifreli, anahtar)) as IkasTokenlari;
  } catch {
    return null;
  }
  return ikasIstemci(
    {
      magazaAdi: baglanti.magazaAdi,
      tokenlar,
      yenilemeKilidi: baglanti.id,
      tokenlarDegisti: async (t) => {
        await db
          .update(butikBaglantilari)
          .set({ kimlikSifreli: sifrele(JSON.stringify(t), anahtar), updatedAt: new Date() })
          .where(and(eq(butikBaglantilari.id, baglanti.id), eq(butikBaglantilari.durum, 'aktif')));
      },
    },
    fetchFn,
  );
}

/** Platformdan bağımsız mağaza okuma yüzü: ürünler, iade politikası, siparişler. */
export type MagazaKaynagi = {
  urunler(): AsyncGenerator<NormalUrun>;
  iadePolitikasi(): Promise<string | null>;
  siparisler(sonra: Date, simdi: Date): AsyncGenerator<NormalSiparis>;
  siparis(disSiparisId: string): Promise<NormalSiparis | null>;
};

/** Platformun yetki reddi hatası mı (bağlantı 'koptu' olmalı). */
export function yetkiHatasiMi(e: unknown): boolean {
  return e instanceof IkasYetkiHatasi || e instanceof ShopifyYetkiHatasi;
}

/**
 * Shopify bağlantısının GraphQL istemcisi. Yenilenen token şifreli yazılır, yalnız durum
 * 'aktif' iken. Kimlik ya da uygulama anahtarı okunamazsa null.
 */
export async function shopifyBaglantiIstemcisi(
  baglanti: { id: string; magazaAdi: string; kimlikSifreli: string },
  fetchFn: typeof fetch = fetch,
): Promise<Shopify | null> {
  const anahtar = env.BAGLANTI_SIFRELEME_ANAHTARI;
  if (!anahtar) return null;
  const tokenlar = kimlikCoz(baglanti.kimlikSifreli, anahtar);
  if (!tokenlar) return null;
  let uyg: { clientId: string; secret: string } | null;
  try {
    uyg = await shopifyUygulamasi(baglanti.magazaAdi);
  } catch {
    return null;
  }
  if (!uyg) return null;
  return shopifyIstemci(
    {
      magaza: baglanti.magazaAdi,
      uyg,
      tokenlar,
      yenilemeYoneticisi: (elimdeki, agdanYenile) =>
        shopifyTokenYenilemesi(baglanti.id, anahtar, elimdeki, agdanYenile),
      guncelTokenlar: async () => {
        const [satir] = await db
          .select({ kimlikSifreli: butikBaglantilari.kimlikSifreli })
          .from(butikBaglantilari)
          .where(eq(butikBaglantilari.id, baglanti.id));
        return kimlikCoz(satir?.kimlikSifreli, anahtar);
      },
    },
    fetchFn,
  );
}

function kimlikCoz(
  kimlikSifreli: string | null | undefined,
  anahtar: string,
): ShopifyTokenlari | null {
  if (!kimlikSifreli) return null;
  try {
    return JSON.parse(coz(kimlikSifreli, anahtar)) as ShopifyTokenlari;
  } catch {
    return null;
  }
}

/**
 * Shopify token yenilemesi bağlantı başına tek: sipariş taraması, ürün eşitleme ve aynı anda
 * gelen webhook'lar ayrı istemci kurar. Yenileme token'ı tek kullanımlık olduğundan iki yenileme
 * ikincisini reddettirir (bağlantı 'koptu' olurdu). Kilit altında kalıcı kopya yeniden okunur;
 * başka süreç yenilemişse onun çifti benimsenir, değilse yenilenip yeni çift şifreli yazılır
 * (yalnız durum 'aktif' iken). Kilit işlem bitince bırakılır.
 */
async function shopifyTokenYenilemesi(
  baglantiId: string,
  anahtar: string,
  elimdeki: ShopifyTokenlari,
  agdanYenile: () => Promise<ShopifyTokenlari>,
): Promise<ShopifyTokenlari> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`shopify_token:${baglantiId}`}))`);
    const [satir] = await tx
      .select({ kimlikSifreli: butikBaglantilari.kimlikSifreli, durum: butikBaglantilari.durum })
      .from(butikBaglantilari)
      .where(eq(butikBaglantilari.id, baglantiId));
    const kayitli = kimlikCoz(satir?.kimlikSifreli, anahtar);
    if (kayitli && (kayitli.erisim !== elimdeki.erisim || kayitli.yenileme !== elimdeki.yenileme)) {
      return kayitli;
    }
    const yeni = await agdanYenile();
    if (satir?.durum === 'aktif') {
      await tx
        .update(butikBaglantilari)
        .set({ kimlikSifreli: sifrele(JSON.stringify(yeni), anahtar), updatedAt: new Date() })
        .where(and(eq(butikBaglantilari.id, baglantiId), eq(butikBaglantilari.durum, 'aktif')));
    }
    return yeni;
  });
}

/**
 * Bağlantının platformuna göre mağaza kaynağı. Kimlik/anahtar okunamazsa ya da platform
 * bilinmiyorsa null. Shopify'da yenilenen token şifreli yazılır, yalnız durum 'aktif' iken.
 */
export async function baglantiKaynagi(
  baglanti: { id: string; platform: string; magazaAdi: string; kimlikSifreli: string },
  fetchFn: typeof fetch = fetch,
): Promise<MagazaKaynagi | null> {
  if (baglanti.platform === 'ikas') {
    const ist = baglantiIstemcisi(baglanti, fetchFn);
    if (!ist) return null;
    return {
      urunler: () => ikasUrunleriniGetir(ist),
      iadePolitikasi: () => ikasIadePolitikasiGetir(ist),
      siparisler: (sonra) => ikasSiparisleriniGetir(ist, sonra),
      siparis: (id) => ikasSiparisGetir(ist, id),
    };
  }
  if (baglanti.platform === 'shopify') {
    const ist = await shopifyBaglantiIstemcisi(baglanti, fetchFn);
    if (!ist) return null;
    return {
      urunler: () => shopifyUrunleriniGetir(ist),
      iadePolitikasi: () => shopifyIadePolitikasiGetir(ist),
      siparisler: (sonra, simdi) => shopifySiparisleriniGetir(ist, sonra, simdi),
      siparis: (id) => shopifySiparisGetir(ist, id),
    };
  }
  return null;
}

/** ikas yetkiyi reddetti: aktif bağlantı 'koptu' olur, ürünleri Butika'dan kalkar. Düşen satır sayısı. */
export async function baglantiyiKopar(baglantiId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const dusen = await tx
      .update(baglantiUrunleri)
      .set({ aktif: false })
      .where(and(eq(baglantiUrunleri.baglantiId, baglantiId), eq(baglantiUrunleri.aktif, true)))
      .returning({ id: baglantiUrunleri.id });
    await tx
      .update(butikBaglantilari)
      .set({ durum: 'koptu', sonHata: KOPTU_HATASI, updatedAt: new Date() })
      .where(and(eq(butikBaglantilari.id, baglantiId), eq(butikBaglantilari.durum, 'aktif')));
    return dusen.length;
  });
}
