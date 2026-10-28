// apps/api/src/lib/kayit/urun-etiketi-job.ts
import { savedProducts } from '@butika/db';
import type { UrunEtiketi } from '@butika/types';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../logger';
import { etiketle as varsayilanEtiketle, kalanHak } from './urun-etiketi';
import { urunAdiAyir } from './urun-adi';

// Bir ürün en çok bu kadar kez denenir; sonra etiketsiz kalır.
const EN_COK_DENEME = 3;
const PARTI = 10;

interface Bekleyen {
  id: string;
  url: string;
  title: string;
}

export type PartiAdimi =
  | { id: string; islem: 'kopyala'; etiket: UrunEtiketi }
  | { id: string; islem: 'sor'; ad: string };

/**
 * Bazı siteler her ürün sayfasında aynı genel başlığı verir ("Abiye Elbiseler | Lafaba").
 * Adresin son parçası çoğu zaman ürünü anlatır; modele ipucu olarak eklenir.
 */
export function adresIpucu(url: string): string {
  try {
    const son = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    const metin = decodeURIComponent(son).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return /\p{L}{3}/u.test(metin) ? ` (adres: ${metin.slice(0, 120)})` : '';
  } catch {
    return '';
  }
}

/** Seçilen satırlar için ne yapılacağını belirler. Saf işlev. */
export function partiPlani(
  bekleyenler: Bekleyen[],
  hazirEtiketler: Map<string, UrunEtiketi>,
  hak: number,
): PartiAdimi[] {
  const plan: PartiAdimi[] = [];
  let kalan = hak;
  for (const b of bekleyenler) {
    const hazir = hazirEtiketler.get(b.url);
    if (hazir) {
      plan.push({ id: b.id, islem: 'kopyala', etiket: hazir });
    } else if (kalan > 0) {
      kalan--;
      plan.push({ id: b.id, islem: 'sor', ad: `${urunAdiAyir(b.title).ad}${adresIpucu(b.url)}` });
    }
  }
  return plan;
}

export async function runEtiketBatch(
  secenekler: { limit?: number; etiketle?: typeof varsayilanEtiketle; simdi?: Date } = {},
): Promise<{ secilen: number; etiketlenen: number; kopyalanan: number; basarisiz: number }> {
  const simdi = secenekler.simdi ?? new Date();
  const etiketle = secenekler.etiketle ?? varsayilanEtiketle;
  const gunBasi = new Date(Date.UTC(simdi.getUTCFullYear(), simdi.getUTCMonth(), simdi.getUTCDate()));

  const bekleyenler = await db
    .select({ id: savedProducts.id, url: savedProducts.url, title: savedProducts.title })
    .from(savedProducts)
    .where(
      and(
        eq(savedProducts.sayfaTuru, 'urun'),
        isNull(savedProducts.etiketlendiAt),
        lt(savedProducts.etiketDeneme, EN_COK_DENEME),
        // Başarısız deneme ertesi gün yinelenir; böylece günlük sınır deneme sayısıyla birebir tutar.
        or(isNull(savedProducts.etiketDenemeAt), lt(savedProducts.etiketDenemeAt, gunBasi)),
      ),
    )
    .orderBy(asc(savedProducts.createdAt))
    .limit(secenekler.limit ?? PARTI);
  const sonuc = { secilen: bekleyenler.length, etiketlenen: 0, kopyalanan: 0, basarisiz: 0 };
  if (bekleyenler.length === 0) return sonuc;

  // Günlük sınır bellekte değil veritabanında sayılır: yeniden başlatma sınırı sıfırlamaz.
  const [sayim] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(savedProducts)
    .where(gte(savedProducts.etiketDenemeAt, gunBasi));

  const hazirSatirlar = await db
    .select({
      url: savedProducts.url,
      tur: savedProducts.urunTuru,
      renk: savedProducts.urunRengi,
      malzeme: savedProducts.urunMalzemesi,
    })
    .from(savedProducts)
    .where(
      and(
        inArray(
          savedProducts.url,
          bekleyenler.map((b) => b.url),
        ),
        isNotNull(savedProducts.etiketlendiAt),
        isNotNull(savedProducts.urunTuru),
      ),
    );
  const hazir = new Map<string, UrunEtiketi>(
    hazirSatirlar.map((s) => [s.url, { tur: s.tur, renk: s.renk, malzeme: s.malzeme } as UrunEtiketi]),
  );

  for (const adim of partiPlani(bekleyenler, hazir, kalanHak(sayim?.n ?? 0))) {
    if (adim.islem === 'kopyala') {
      await yaz(adim.id, adim.etiket, simdi, false);
      sonuc.kopyalanan++;
      continue;
    }
    const etiket = await etiketle(adim.ad);
    if (etiket) {
      await yaz(adim.id, etiket, simdi, true);
      sonuc.etiketlenen++;
    } else {
      await db
        .update(savedProducts)
        .set({ etiketDeneme: sql`${savedProducts.etiketDeneme} + 1`, etiketDenemeAt: simdi })
        .where(eq(savedProducts.id, adim.id));
      sonuc.basarisiz++;
    }
  }
  return sonuc;
}

async function yaz(id: string, e: UrunEtiketi, simdi: Date, denemeSay: boolean): Promise<void> {
  await db
    .update(savedProducts)
    .set({
      urunTuru: e.tur,
      urunRengi: e.renk,
      urunMalzemesi: e.malzeme,
      etiketlendiAt: simdi,
      ...(denemeSay ? { etiketDeneme: sql`${savedProducts.etiketDeneme} + 1`, etiketDenemeAt: simdi } : {}),
    })
    .where(eq(savedProducts.id, id));
}

let calisiyor = false;
async function korumali(): Promise<void> {
  if (calisiyor) return;
  calisiyor = true;
  try {
    const s = await runEtiketBatch();
    if (s.secilen > 0) logger.info(s, 'urun-etiketi: parti bitti');
  } catch (err) {
    logger.warn({ err }, 'urun-etiketi: parti hata verdi');
  } finally {
    calisiyor = false;
  }
}

export function startUrunEtiketiJob(): void {
  void korumali();
  setInterval(() => {
    void korumali();
  }, 60_000);
}
