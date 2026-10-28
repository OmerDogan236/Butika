import { butikBaglantilari } from '@butika/db';
import { and, asc, eq, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../logger';
import { baglantiyiEsitle } from './urun-esitleme';

const ESITLEME_ARALIGI_MS = 4 * 60 * 60_000;
// Geçici hatada sonUrunEsitlemeAt değişmez; aynı bağlantı dakikada bir zorlanmasın.
const TEKRAR_BEKLEME_MS = 15 * 60_000;
const TUR_BASINA_EN_COK = 20;

const sonDeneme = new Map<string, number>();
let calisiyor = false;

/** Eşitlenmesi gelen bağlantıları sırayla (tek tek) eşitler; biri hata verse de sonrakine geçer. */
export async function bekleyenBaglantilariEsitle(
  simdi = new Date(),
  fetchFn?: typeof fetch,
): Promise<number> {
  const sinir = new Date(simdi.getTime() - ESITLEME_ARALIGI_MS);
  // Bekleme süresi dolan kayıtlar silinir; süresi dolmamışlar sorguda elenir (LIMIT'i yemesin).
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
          isNull(butikBaglantilari.sonUrunEsitlemeAt),
          lt(butikBaglantilari.sonUrunEsitlemeAt, sinir),
        ),
      ),
    )
    .orderBy(sql`${butikBaglantilari.sonUrunEsitlemeAt} asc nulls first`, asc(butikBaglantilari.id))
    .limit(TUR_BASINA_EN_COK);
  let islenen = 0;
  for (const { id } of adaylar) {
    sonDeneme.set(id, simdi.getTime());
    try {
      const s = await baglantiyiEsitle(id, { simdi, fetchFn });
      if (s.atlandi) {
        // Başka yerde (ilk eşitleme) sürüyor: sayılmaz, bekleme de başlamaz.
        sonDeneme.delete(id);
        continue;
      }
      islenen++;
      logger.info({ baglantiId: id, ...s }, 'urun-esitleme: bağlantı eşitlendi');
    } catch (error) {
      logger.error(
        { baglantiId: id, error: String(error).slice(0, 300) },
        'urun-esitleme: bağlantı başarısız',
      );
    }
  }
  return islenen;
}

async function runGuarded() {
  if (calisiyor) return;
  calisiyor = true;
  try {
    await bekleyenBaglantilariEsitle();
  } catch (error) {
    logger.error({ error: String(error).slice(0, 300) }, 'urun-esitleme: adım başarısız');
  } finally {
    calisiyor = false;
  }
}

export function startBaglantiEsitlemeJob(): void {
  void runGuarded();
  setInterval(() => {
    void runGuarded();
  }, 60_000);
}
