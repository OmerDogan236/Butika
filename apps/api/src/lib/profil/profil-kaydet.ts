import {
  events,
  boutiqueCategories,
  boutiques,
  kullaniciProfilleri,
  savedProducts,
  tarzTestiCevaplari,
  trackedProducts,
} from '@butika/db';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { env } from '../../env';
import { db } from '../db';
import { logger } from '../logger';
import { pazarParaBirimi } from '../price-tracking/pazar';
import { kayittanTestPuanlari } from '../tarz-testi';
import {
  type KullaniciProfili,
  type ProfilButigi,
  type ProfilGirdileri,
  type ProfilHareketi,
  profilHesapla,
} from './profil-hesapla';

// Profil girdilerini veritabanından toplar, hesaplar ve kullanici_profilleri'ne yazar.
// Anlık tetik (kayıt, satın alma, test) ve gece işi aynı işlevi çağırır.
// Tasarım: docs/superpowers/specs/2026-10-05-kullanici-profili-tasarim.md (§2.5)

/** Daha eski olaylar okunmaz: 365 günde etki 0.5^(365/90) ≈ %6'ya iner. */
const OLAY_PENCERESI_GUN = 365;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACMA_OLAYLARI = ['boutique_view', 'webview_open'];
const SILME_OLAYI = 'product_unsaved';

type ButikSatiri = {
  id: string;
  tarz1: string | null;
  tarz2: string | null;
  fiyatSegmenti: string | null;
  countryCode: string;
};

export async function profilGirdileriniOku(userId: string, simdi: Date): Promise<ProfilGirdileri> {
  const pencere = new Date(simdi.getTime() - OLAY_PENCERESI_GUN * 24 * 60 * 60 * 1000);
  const butikIdOlaydan = sql<
    string | null
  >`coalesce(${events.payload}->>'boutiqueId', ${events.payload}->>'boutique_id')`;

  const [testler, kayitSatirlari, olaylar] = await Promise.all([
    db
      .select()
      .from(tarzTestiCevaplari)
      .where(eq(tarzTestiCevaplari.userId, userId))
      .orderBy(desc(tarzTestiCevaplari.createdAt))
      .limit(1),
    db
      .select({
        boutiqueId: savedProducts.boutiqueId,
        kaydedildi: savedProducts.createdAt,
        satinAlindi: savedProducts.purchasedAt,
        fiyatMinor: trackedProducts.currentPriceMinor,
        paraBirimi: trackedProducts.currency,
        tur: savedProducts.urunTuru,
        renk: savedProducts.urunRengi,
        malzeme: savedProducts.urunMalzemesi,
      })
      .from(savedProducts)
      .leftJoin(trackedProducts, eq(trackedProducts.id, savedProducts.trackedProductId))
      .where(eq(savedProducts.userId, userId)),
    db
      .select({
        type: events.type,
        butikId: butikIdOlaydan,
        url: sql<string | null>`${events.payload}->>'url'`,
        zaman: events.createdAt,
      })
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          inArray(events.type, [...ACMA_OLAYLARI, SILME_OLAYI]),
          gte(events.createdAt, pencere),
        ),
      ),
  ]);

  // Kayıt silme olayında yalnız adres var; butik aynı adresin kaydetme olayından bulunur.
  const silinenAdresler = [
    ...new Set(olaylar.filter((o) => o.type === SILME_OLAYI && o.url).map((o) => o.url as string)),
  ];
  const adrestenButik = new Map<string, string>();
  if (silinenAdresler.length > 0) {
    const kayitOlaylari = await db
      .select({ url: sql<string>`${events.payload}->>'url'`, butikId: butikIdOlaydan })
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          eq(events.type, 'product_saved'),
          inArray(sql`${events.payload}->>'url'`, silinenAdresler),
        ),
      )
      .orderBy(desc(events.createdAt));
    for (const k of kayitOlaylari) {
      if (k.butikId && UUID.test(k.butikId) && !adrestenButik.has(k.url)) {
        adrestenButik.set(k.url, k.butikId);
      }
    }
  }

  const olayButigi = (o: (typeof olaylar)[number]): string | null => {
    const id = o.type === SILME_OLAYI ? (o.url ? adrestenButik.get(o.url) : undefined) : o.butikId;
    return id && UUID.test(id) ? id : null;
  };

  const butikIdleri = [
    ...new Set([
      ...kayitSatirlari.map((k) => k.boutiqueId),
      ...olaylar.map(olayButigi).filter((id): id is string => id !== null),
    ]),
  ];
  const [butikSatirlari, uyelikler] =
    butikIdleri.length === 0
      ? [[] as ButikSatiri[], [] as { boutiqueId: string; categoryId: string }[]]
      : await Promise.all([
          db
            .select({
              id: boutiques.id,
              tarz1: boutiques.tarz1,
              tarz2: boutiques.tarz2,
              fiyatSegmenti: boutiques.fiyatSegmenti,
              countryCode: boutiques.countryCode,
            })
            .from(boutiques)
            .where(inArray(boutiques.id, butikIdleri)),
          db
            .select({
              boutiqueId: boutiqueCategories.boutiqueId,
              categoryId: boutiqueCategories.categoryId,
            })
            .from(boutiqueCategories)
            .where(inArray(boutiqueCategories.boutiqueId, butikIdleri)),
        ]);

  const kategoriler = new Map<string, string[]>();
  for (const u of uyelikler) {
    kategoriler.set(u.boutiqueId, [...(kategoriler.get(u.boutiqueId) ?? []), u.categoryId]);
  }
  const butikler = new Map<string, ProfilButigi>(
    butikSatirlari.map((b) => [
      b.id,
      {
        tarz1: b.tarz1,
        tarz2: b.tarz2,
        fiyatSegmenti: b.fiyatSegmenti,
        kategoriIdleri: kategoriler.get(b.id) ?? [],
        pazarParaBirimi: pazarParaBirimi(b.countryCode),
      },
    ]),
  );

  const hareketler = (turler: string[]): ProfilHareketi[] =>
    olaylar.flatMap((o) => {
      if (!turler.includes(o.type)) return [];
      const id = olayButigi(o);
      const butik = id ? butikler.get(id) : undefined;
      return butik ? [{ butik, zaman: o.zaman }] : [];
    });

  const test = testler[0];
  return {
    test: test
      ? {
          tarzPuanlari: kayittanTestPuanlari(test),
          fiyatSegmentleri: test.fiyatSegmentleri,
          yasAraligi: test.yasAraligi,
        }
      : null,
    kayitlar: kayitSatirlari.flatMap((k) => {
      const butik = butikler.get(k.boutiqueId);
      if (!butik) return [];
      return [
        {
          butik,
          kaydedildi: k.kaydedildi,
          satinAlindi: k.satinAlindi,
          fiyat:
            k.fiyatMinor !== null && k.paraBirimi
              ? { minor: k.fiyatMinor, paraBirimi: k.paraBirimi }
              : null,
          etiket: { tur: k.tur, renk: k.renk, malzeme: k.malzeme },
        },
      ];
    }),
    // "Butiği favorilere ekle" özelliği yok (kayıtlı ürünler zaten kayit olarak sayılıyor).
    favoriler: [],
    butikAcmalari: hareketler(ACMA_OLAYLARI),
    kayitSilmeleri: hareketler([SILME_OLAYI]),
  };
}

export async function profiliYaz(userId: string, p: KullaniciProfili): Promise<void> {
  const alanlar = {
    tarz: p.tarz,
    butce: p.butce,
    kategoriler: p.kategoriler,
    urunEtiketleri: p.urunEtiketleri,
    yasAraligi: p.yasAraligi,
    kayitSayisi: p.kayitSayisi,
    kaynak: p.kaynak,
    guncellendi: p.guncellendi,
  };
  await db
    .insert(kullaniciProfilleri)
    .values({ userId, ...alanlar })
    .onConflictDoUpdate({ target: kullaniciProfilleri.userId, set: alanlar });
}

export async function profiliYenidenHesapla(
  userId: string,
  simdi: Date = new Date(),
): Promise<KullaniciProfili> {
  const profil = profilHesapla(await profilGirdileriniOku(userId, simdi), simdi);
  await profiliYaz(userId, profil);
  return profil;
}

/**
 * İsteği bekletmeden profili yeniden hesaplar. Asla fırlatmaz; hata yalnız loglanır.
 * PROFIL_HESAP_ENABLED kapalıysa hiçbir şey yapmaz.
 */
export function profiliArkaplandaHesapla(userId: string): void {
  if (!env.PROFIL_HESAP_ENABLED) return;
  try {
    void profiliYenidenHesapla(userId).catch((err) => {
      logger.warn({ err, userId }, 'profil: anlık hesap başarısız');
    });
  } catch (err) {
    logger.warn({ err, userId }, 'profil: anlık hesap başlatılamadı');
  }
}
