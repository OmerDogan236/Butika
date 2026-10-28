import { butikBaglantilari } from '@butika/db';
import { and, asc, eq, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../logger';
import { baglantiSiparisleriniTara } from './siparis-isle';

const TARAMA_ARALIGI_MS = 60 * 60_000;
// Geçici hatada sonSiparisTaramaAt değişmez; aynı bağlantı dakikada bir zorlanmasın.
const TEKRAR_BEKLEME_MS = 15 * 60_000;
const TUR_BASINA_EN_COK = 50;

const sonDeneme = new Map<string, number>();
let calisiyor = false;

/** Saati dolan aktif bağlantıların siparişlerini sırayla tarar; biri hata verse de sonrakine geçer. */
export async function bekleyenSiparisleriTara(
  simdi = new Date(),
  fetchFn?: typeof fetch,
): Promise<number> {
  const sinir = new Date(simdi.getTime() - TARAMA_ARALIGI_MS);
  for (const [id, t] of sonDeneme)
    if (simdi.getTime() - t >= TEKRAR_BEKLEME_MS) sonDeneme.delete(id);
  const beklemede = [...sonDeneme.keys()];
  const adaylar = await db
    .select({ id: butikBaglantilari.id })
    .from(butikBaglantilari)
    .where(
      and(
        eq(butikBaglantilari.durum, 'aktif'),
        ...(beklemede.length ? [notInArray(butikBaglantilari.id, beklemede)] : []),
        or(
          isNull(butikBaglantilari.sonSiparisTaramaAt),
          lt(butikBaglantilari.sonSiparisTaramaAt, sinir),
        ),
      ),
    )
    .orderBy(
      sql`${butikBaglantilari.sonSiparisTaramaAt} asc nulls first`,
      asc(butikBaglantilari.id),
    )
    .limit(TUR_BASINA_EN_COK);
  let taranan = 0;
  for (const { id } of adaylar) {
    // baglantiSiparisleriniTara fırlatmaz; geçici hata bekleme süresinde yeniden denenmez.
    const sonuc = await baglantiSiparisleriniTara(id, { simdi, fetchFn });
    if (sonuc === 'tamam') {
      sonDeneme.delete(id);
      taranan++;
    } else sonDeneme.set(id, simdi.getTime());
  }
  return taranan;
}

async function runGuarded() {
  if (calisiyor) return;
  calisiyor = true;
  try {
    await bekleyenSiparisleriTara();
  } catch (error) {
    logger.error({ error: String(error).slice(0, 300) }, 'siparis-tarama: adım başarısız');
  } finally {
    calisiyor = false;
  }
}

/** Her bağlantı saatte bir taranır; dakikada bir saati dolanlar seçilir. */
export function startSiparisTaramaJob(): void {
  void runGuarded();
  setInterval(() => {
    void runGuarded();
  }, 60_000);
}
