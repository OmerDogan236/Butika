// Admin "Bildirimler": zamanı gelen planlı duyuruları gönderir. Push gönderim anahtarı
// (PUSH_DELIVERY_ENABLED) açıkken çalışır; anahtar kapanırsa planlar bekler.
import { bildirimPlanlari } from '@butika/db';
import { bildirimKampanyasi } from '@butika/types';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../logger';
import { duyuruAlicilari, duyuruGonder } from './duyuru';

/** Zamanından bu kadar sonra yakalanan plan gönderilmez (gece yarısı "günaydın" gitmesin). */
export const GECIKME_SINIRI_MS = 60 * 60 * 1000;

export function gecikmeKarari(zaman: Date, simdi: Date): 'gonder' | 'gecikti' {
  return simdi.getTime() - zaman.getTime() > GECIKME_SINIRI_MS ? 'gecikti' : 'gonder';
}

/** Zamanı gelmiş bir planı "gonderiliyor"a çekerek sahiplenir; aynı planı iki kez almaz. */
async function siradakiniAl() {
  const siradaki = db
    .select({ id: bildirimPlanlari.id })
    .from(bildirimPlanlari)
    .where(
      and(
        eq(bildirimPlanlari.durum, 'planlandi'),
        lte(bildirimPlanlari.gonderimZamani, sql`now()`),
      ),
    )
    .orderBy(asc(bildirimPlanlari.gonderimZamani))
    .limit(1)
    .for('update', { skipLocked: true });
  const [plan] = await db
    .update(bildirimPlanlari)
    .set({ durum: 'gonderiliyor', updatedAt: sql`now()` })
    .where(eq(bildirimPlanlari.id, sql`(${siradaki})`))
    .returning();
  return plan;
}

export async function runBildirimPlaniBatch(simdi: () => Date = () => new Date()): Promise<number> {
  let islenen = 0;
  for (let i = 0; i < 5; i++) {
    const plan = await siradakiniAl();
    if (!plan) break;
    islenen += 1;
    if (gecikmeKarari(plan.gonderimZamani, simdi()) === 'gecikti') {
      await db
        .update(bildirimPlanlari)
        .set({ durum: 'gecikti', updatedAt: sql`now()` })
        .where(eq(bildirimPlanlari.id, plan.id));
      logger.warn({ id: plan.id }, 'bildirim planı gecikti, gönderilmedi');
      continue;
    }
    try {
      const cihazlar = await duyuruAlicilari(plan.kitle === 'savers' ? 'savers' : 'all');
      const { ok, errors } = await duyuruGonder(cihazlar, {
        title: plan.baslik,
        body: plan.metin,
        campaign: bildirimKampanyasi(plan.id),
        target: plan.hedef,
      });
      const hatali = Object.values(errors).reduce((a, b) => a + b, 0);
      await db
        .update(bildirimPlanlari)
        .set({
          durum: 'gonderildi',
          aliciSayisi: new Set(cihazlar.map((c) => c.userId)).size,
          basarili: ok,
          hatali,
          gonderildiAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(bildirimPlanlari.id, plan.id));
      logger.info({ id: plan.id, ok, hatali }, 'bildirim planı gönderildi');
    } catch (err) {
      await db
        .update(bildirimPlanlari)
        .set({ durum: 'hata', updatedAt: sql`now()` })
        .where(eq(bildirimPlanlari.id, plan.id));
      logger.error({ err, id: plan.id }, 'bildirim planı gönderilemedi');
    }
  }
  return islenen;
}

let started = false;
let running = false;

export function startBildirimPlaniJob(): void {
  if (started) return;
  started = true;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runBildirimPlaniBatch();
    } catch (err) {
      logger.error({ err }, 'bildirim planı turu başarısız');
    } finally {
      running = false;
    }
  };
  void tick();
  setInterval(() => {
    void tick();
  }, 30000).unref();
}
