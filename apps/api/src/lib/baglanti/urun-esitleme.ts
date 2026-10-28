import { baglantiUrunleri, butikBaglantilari } from '@butika/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../logger';
import { baglantiKaynagi, baglantiyiKopar, yetkiHatasiMi } from './baglanti-istemcisi';
import { IkasSorguHatasi } from './ikas/ikas-istemci';
import type { NormalUrun } from './ikas/ikas-urun';
import { ShopifySorguHatasi } from './shopify/shopify-istemci';

export type EsitlemeSonucu = {
  eklenen: number;
  guncellenen: number;
  dusen: number;
  /** Aynı bağlantı o sırada zaten eşitleniyordu; hiçbir şey yapılmadı. */
  atlandi?: true;
};

const SIFIR: EsitlemeSonucu = { eklenen: 0, guncellenen: 0, dusen: 0 };
const TOPLU = 100;

// Aynı süreçte aynı bağlantı iki kez eşitlenmesin (ilk eşitleme ile iş çakışabilir).
const calisanlar = new Set<string>();

const anahtar = (disUrunId: string | null, disVaryantId: string | null) =>
  `${disUrunId ?? ''}\u0000${disVaryantId ?? ''}`;

const hataOzeti = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

function adresNormalle(adres: string): string | null {
  try {
    return new URL(adres).href;
  } catch {
    return null;
  }
}

const degerler = (u: NormalUrun, url: string) => ({
  ad: u.ad,
  aciklama: u.aciklama,
  url,
  gorseller: u.gorseller,
  fiyatMinor: u.fiyatMinor,
  indirimliFiyatMinor: u.indirimliFiyatMinor,
  currency: u.currency,
  stokta: u.stokta,
  stokAdedi: u.stokAdedi,
  secenekler: u.secenekler,
  kategori: u.kategori,
});

/**
 * Bağlı mağazanın ürünlerini baglanti_urunleri'ne eşitler. Hiçbir durumda fırlatmaz:
 * yetki kaybı bağlantıyı 'koptu' yapar, geçici hata yalnız sonHata'ya yazılır.
 */
export async function baglantiyiEsitle(
  baglantiId: string,
  deps: { fetchFn?: typeof fetch; simdi?: Date } = {},
): Promise<EsitlemeSonucu> {
  if (calisanlar.has(baglantiId)) return { ...SIFIR, atlandi: true };
  calisanlar.add(baglantiId);
  try {
    return await esitle(baglantiId, deps.fetchFn ?? fetch, deps.simdi ?? new Date());
  } catch (e) {
    logger.error({ baglantiId, hata: hataOzeti(e) }, 'urun-esitleme: beklenmeyen hata');
    return { ...SIFIR };
  } finally {
    calisanlar.delete(baglantiId);
  }
}

async function hataYaz(baglantiId: string, sonHata: string): Promise<void> {
  await db
    .update(butikBaglantilari)
    .set({ sonHata, updatedAt: new Date() })
    .where(eq(butikBaglantilari.id, baglantiId));
}

async function esitle(
  baglantiId: string,
  fetchFn: typeof fetch,
  simdi: Date,
): Promise<EsitlemeSonucu> {
  const [baglanti] = await db
    .select()
    .from(butikBaglantilari)
    .where(eq(butikBaglantilari.id, baglantiId));
  if (!baglanti || baglanti.durum !== 'aktif') return { ...SIFIR };

  const ist = await baglantiKaynagi(baglanti, fetchFn);
  if (!ist) {
    await hataYaz(baglantiId, 'kimlik_okunamadi');
    return { ...SIFIR };
  }

  const mevcut = new Map(
    (
      await db
        .select({
          id: baglantiUrunleri.id,
          disUrunId: baglantiUrunleri.disUrunId,
          disVaryantId: baglantiUrunleri.disVaryantId,
          url: baglantiUrunleri.url,
          ad: baglantiUrunleri.ad,
          fiyatMinor: baglantiUrunleri.fiyatMinor,
          indirimliFiyatMinor: baglantiUrunleri.indirimliFiyatMinor,
          currency: baglantiUrunleri.currency,
          stokta: baglantiUrunleri.stokta,
          stokAdedi: baglantiUrunleri.stokAdedi,
          kategori: baglantiUrunleri.kategori,
          aktif: baglantiUrunleri.aktif,
        })
        .from(baglantiUrunleri)
        .where(eq(baglantiUrunleri.baglantiId, baglantiId))
    ).map((s) => [anahtar(s.disUrunId, s.disVaryantId), s]),
  );

  const gorulen = new Set<string>();
  let eklenen = 0;
  let guncellenen = 0;
  const bekleyen: (typeof baglantiUrunleri.$inferInsert)[] = [];
  const bekleyeniYaz = async () => {
    if (!bekleyen.length) return;
    const parca = bekleyen.splice(0, bekleyen.length);
    await db
      .insert(baglantiUrunleri)
      .values(parca)
      .onConflictDoUpdate({
        target: [
          baglantiUrunleri.baglantiId,
          baglantiUrunleri.disUrunId,
          baglantiUrunleri.disVaryantId,
        ],
        set: {
          ad: sql`excluded.ad`,
          aciklama: sql`excluded.aciklama`,
          url: sql`excluded.url`,
          gorseller: sql`excluded.gorseller`,
          fiyatMinor: sql`excluded.fiyat_minor`,
          indirimliFiyatMinor: sql`excluded.indirimli_fiyat_minor`,
          currency: sql`excluded.currency`,
          stokta: sql`excluded.stokta`,
          stokAdedi: sql`excluded.stok_adedi`,
          secenekler: sql`excluded.secenekler`,
          kategori: sql`excluded.kategori`,
          aktif: sql`true`,
          sonGorulmeAt: sql`excluded.son_gorulme_at`,
        },
      });
  };

  try {
    for await (const u of ist.urunler()) {
      const url = adresNormalle(u.url);
      if (!url) continue;
      const k = anahtar(u.disUrunId, u.disVaryantId);
      if (gorulen.has(k)) continue; // aynı turda yinelenen satır tek toplu yazıda çakışmasın
      gorulen.add(k);
      const onceki = mevcut.get(k);
      const yeni = degerler(u, url);
      bekleyen.push({
        baglantiId,
        boutiqueId: baglanti.boutiqueId,
        disUrunId: u.disUrunId,
        disVaryantId: u.disVaryantId,
        ...yeni,
        aktif: true,
        sonGorulmeAt: simdi,
      });
      if (bekleyen.length >= TOPLU) await bekleyeniYaz();
      if (!onceki) eklenen++;
      else if (
        !onceki.aktif ||
        onceki.url !== yeni.url ||
        onceki.ad !== yeni.ad ||
        onceki.fiyatMinor !== yeni.fiyatMinor ||
        onceki.indirimliFiyatMinor !== yeni.indirimliFiyatMinor ||
        onceki.currency !== yeni.currency ||
        onceki.stokta !== yeni.stokta ||
        onceki.stokAdedi !== yeni.stokAdedi ||
        onceki.kategori !== yeni.kategori
      )
        guncellenen++;
    }
    await bekleyeniYaz();
  } catch (e) {
    if (yetkiHatasiMi(e)) {
      const dusen = await baglantiyiKopar(baglantiId);
      logger.warn({ baglantiId }, 'urun-esitleme: ikas yetkisi reddedildi, bağlantı koptu');
      return { eklenen, guncellenen, dusen };
    }
    if (e instanceof IkasSorguHatasi || e instanceof ShopifySorguHatasi) {
      // Tur yarım kaldı: görülmeyenler düşürülmez, yalnız hata yazılır; görülenler kaydedilir.
      await bekleyeniYaz().catch(() => undefined);
      await hataYaz(baglantiId, `ikas_gecici: ${hataOzeti(e)}`);
      logger.warn({ baglantiId, hata: hataOzeti(e) }, 'urun-esitleme: geçici ikas hatası');
      return { eklenen, guncellenen, dusen: 0 };
    }
    throw e;
  }

  // Tur eksiksiz bitti. Ama hiç ürün gelmediyse ve aktif satır varsa bu bir mağaza boşalması
  // değil ikas aksaklığı sayılır: hiçbir şey düşürülmez.
  const dusecek = [...mevcut.entries()]
    .filter(([k, s]) => s.aktif && !gorulen.has(k))
    .map(([, s]) => s.id);
  if (gorulen.size === 0 && dusecek.length) {
    await hataYaz(baglantiId, 'bos_urun_listesi');
    logger.warn({ baglantiId }, 'urun-esitleme: ikas boş ürün listesi döndü, satırlar korundu');
    return { ...SIFIR };
  }

  let iade: string | null = null;
  try {
    iade = await ist.iadePolitikasi();
  } catch (e) {
    logger.warn({ baglantiId, hata: hataOzeti(e) }, 'urun-esitleme: iade politikası alınamadı');
  }
  return db.transaction(async (tx) => {
    const [hala] = await tx
      .update(butikBaglantilari)
      .set({
        sonUrunEsitlemeAt: simdi,
        sonHata: null,
        // Boş sonuç elle girileni ezmez.
        ...(iade ? { iadePolitikasi: iade } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(butikBaglantilari.id, baglantiId), eq(butikBaglantilari.durum, 'aktif')))
      .returning({ id: butikBaglantilari.id });
    if (!hala) {
      // Eşitleme sürerken bağlantı kapandı/koptu: satırlar aktif kalmasın.
      const kapanan = await tx
        .update(baglantiUrunleri)
        .set({ aktif: false })
        .where(and(eq(baglantiUrunleri.baglantiId, baglantiId), eq(baglantiUrunleri.aktif, true)))
        .returning({ id: baglantiUrunleri.id });
      return { eklenen, guncellenen, dusen: kapanan.length };
    }
    if (dusecek.length) {
      await tx
        .update(baglantiUrunleri)
        .set({ aktif: false })
        .where(inArray(baglantiUrunleri.id, dusecek));
    }
    return { eklenen, guncellenen, dusen: dusecek.length };
  });
}
