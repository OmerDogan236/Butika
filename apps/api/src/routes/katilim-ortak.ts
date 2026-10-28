import { type baglantiDavetleri, boutiques } from '@butika/db';
import { eq } from 'drizzle-orm';
import { env } from '../env';
import { hosGeldinMaili } from '../lib/baglanti/hos-geldin-maili';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { brevoHazirMi, brevoMailGonder } from '../lib/outreach/brevo';

// ikas ve Shopify katılım yollarının ortak parçaları.

/** Testler sahte ikas/Shopify/Brevo verir. */
export const katilimBagimliliklari: {
  fetchFn: typeof fetch;
  brevoHazir: () => boolean;
  mailGonder: typeof brevoMailGonder;
} = { fetchFn: fetch, brevoHazir: brevoHazirMi, mailGonder: brevoMailGonder };

/** OAuth `state` ömrü. */
export const DURUM_SURESI_MS = 30 * 60_000;

/** Hata nedenini (Postgres kodu/kısıt) loglar; sorgu metni ve değerler loga girmez. */
export function vtHatasi(e: unknown) {
  const neden = (e as { cause?: { code?: string; constraint?: string } })?.cause;
  return { kod: neden?.code ?? null, kisit: neden?.constraint ?? null };
}

/** Geri dönüşte butik tarayıcıdadır: katılım sayfasına (`tamam/` ya da `?hata=`). */
export function katilimAdresi(hata?: string): string {
  return hata
    ? `${env.KATILIM_SAYFASI_URL}?hata=${hata}`
    : new URL('tamam/', env.KATILIM_SAYFASI_URL).toString();
}

/** Kullanılmamış davetin bağlanmaya hazır olup olmadığı (onaylı, state 30 dk içinde). */
export function davetHazirMi(
  davet: typeof baglantiDavetleri.$inferSelect,
): davet is typeof baglantiDavetleri.$inferSelect & {
  durumAt: Date;
  magazaAdi: string;
  onaylayanAd: string;
  iletisimEposta: string;
  sartlarSurumu: string;
  onayAt: Date;
} {
  return (
    !davet.kullanildiAt &&
    !davet.iptalAt &&
    !!davet.durumAt &&
    Date.now() - davet.durumAt.getTime() <= DURUM_SURESI_MS &&
    !!davet.magazaAdi &&
    !!davet.onaylayanAd &&
    !!davet.iletisimEposta &&
    !!davet.sartlarSurumu &&
    !!davet.onayAt
  );
}

/** Bağlantı kurulunca hoş geldin maili; hata yönlendirmeyi etkilemez. */
export async function hosGeldinGonder(
  davet: { id: string; boutiqueId: string },
  eposta: string,
  platform: 'ikas' | 'shopify',
): Promise<void> {
  if (!katilimBagimliliklari.brevoHazir()) return;
  try {
    const [butik] = await db
      .select({ name: boutiques.name })
      .from(boutiques)
      .where(eq(boutiques.id, davet.boutiqueId));
    const sonuc = await katilimBagimliliklari.mailGonder(
      eposta,
      hosGeldinMaili(butik?.name ?? '', platform),
      ['baglanti-hos-geldin'],
    );
    if (!sonuc.ok) logger.warn({ davetId: davet.id }, 'katilim: hoş geldin maili gitmedi');
  } catch {
    logger.warn({ davetId: davet.id }, 'katilim: hoş geldin maili gitmedi');
  }
}
