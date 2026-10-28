import { boutiques, notifications, priceDropEvents, trackedProducts } from '@butika/db';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import type { Availability } from './availability';
import { recordPriceObservation } from './record-price-observation';

/**
 * Türkiye'den okunan fiyat gözlemi (bkz. pazar.ts).
 *
 * Sunucu yurtdışında olduğu için bazı mağazalar (Ticimax, Tsoft) ona TL
 * fiyatı hiç göstermiyor. Kalıcı Türkiye çıkışı kurulana kadar bu ürünler
 * sahibin Türkiye'deki bilgisayarında, sunucuyla aynı okuma koduyla okunur;
 * gözlem normal kayıt akışına verilir (indirim, bildirim, push ve tekrar
 * önleme aynen çalışır).
 */
export type TrGozlem = {
  id: string;
  priceMinor: number;
  currency: string;
  availability: Availability;
  observedAt: string;
};

export type TrGozlemSonucu = {
  id: string;
  durum: 'reddedildi' | 'kuru' | 'kaydedildi';
  neden?: string;
  indirimBildirimi?: number;
};

const EN_ESKI_GOZLEM_MS = 3 * 60 * 60 * 1000;
// Bir günde %60'tan büyük düşüş büyük ihtimalle okuma hatası; elle bakılır.
const SUPHELI_DUSUS = 0.4;

export function gozlemDogrula(
  gozlem: TrGozlem,
  urun: {
    trackingStatus: string;
    notificationBaselinePriceMinor: number | null;
    notificationBaselineCurrency: string | null;
  } | null,
  ulke: string | null,
  simdi: Date,
): string | null {
  if (!urun) return 'ürün bulunamadı';
  if (urun.trackingStatus !== 'active') return 'takip aktif değil';
  if (ulke !== 'TR') return `butik Türkiye pazarında değil (${ulke ?? '-'})`;
  if (gozlem.currency !== 'TRY') return `para birimi TRY değil (${gozlem.currency})`;
  if (!Number.isSafeInteger(gozlem.priceMinor) || gozlem.priceMinor <= 0) return 'geçersiz fiyat';
  const zaman = new Date(gozlem.observedAt).getTime();
  if (!Number.isFinite(zaman) || zaman > simdi.getTime() + 60_000) return 'geçersiz gözlem zamanı';
  if (simdi.getTime() - zaman > EN_ESKI_GOZLEM_MS) return 'gözlem 3 saatten eski';
  if (
    urun.notificationBaselineCurrency === 'TRY' &&
    urun.notificationBaselinePriceMinor &&
    gozlem.priceMinor < urun.notificationBaselinePriceMinor * SUPHELI_DUSUS
  )
    return 'şüpheli düşüş (%60 üstü), elle bakılmalı';
  return null;
}

export async function trGozlemleriIsle(
  gozlemler: TrGozlem[],
  secenek: { kaydet: boolean; simdi?: () => Date },
): Promise<TrGozlemSonucu[]> {
  const simdi = secenek.simdi ?? (() => new Date());
  const sonuc: TrGozlemSonucu[] = [];
  for (const gozlem of gozlemler) {
    const [satir] = await db
      .select({ urun: trackedProducts, ulke: boutiques.countryCode })
      .from(trackedProducts)
      .innerJoin(boutiques, eq(boutiques.id, trackedProducts.boutiqueId))
      .where(eq(trackedProducts.id, gozlem.id))
      .limit(1);
    const neden = gozlemDogrula(gozlem, satir?.urun ?? null, satir?.ulke ?? null, simdi());
    if (neden) {
      sonuc.push({ id: gozlem.id, durum: 'reddedildi', neden });
      continue;
    }
    if (!secenek.kaydet) {
      sonuc.push({ id: gozlem.id, durum: 'kuru' });
      continue;
    }
    const once = await db
      .select({ id: priceDropEvents.id })
      .from(priceDropEvents)
      .where(eq(priceDropEvents.trackedProductId, gozlem.id));
    await recordPriceObservation({
      trackedProductId: gozlem.id,
      priceMinor: gozlem.priceMinor,
      currency: 'TRY',
      availability: gozlem.availability,
      observedAt: new Date(gozlem.observedAt),
    });
    const sonra = await db
      .select({ id: priceDropEvents.id })
      .from(priceDropEvents)
      .where(eq(priceDropEvents.trackedProductId, gozlem.id));
    const yeni = sonra.map((e) => e.id).filter((id) => !once.some((o) => o.id === id));
    const bildirim = yeni.length
      ? (
          await db
            .select({ id: notifications.id })
            .from(notifications)
            .where(and(inArray(notifications.priceDropEventId, yeni)))
        ).length
      : 0;
    sonuc.push({ id: gozlem.id, durum: 'kaydedildi', indirimBildirimi: bildirim });
  }
  return sonuc;
}
