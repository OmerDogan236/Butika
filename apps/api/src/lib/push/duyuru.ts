// Duyuru bildirimi (fiyat/stok bildirimi DEĞİL): alıcı seçimi ve gönderim. Tek seferlik
// betik (scripts/broadcast-push.ts) ve admin "Bildirimler" işçisi aynı kuralları kullanır.
import { pushDevices, savedProducts, users } from '@butika/db';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { env } from '../../env';
import { captureServerEvent } from '../analytics';
import { db } from '../db';
import { logger } from '../logger';
import { type ExpoResult, readExpoReceipts, sendExpoMessage } from './expo-transport';

// Expo makbuzu (Apple/Google'ın kabulü) gönderimden birkaç dakika sonra hazır olur;
// kuyruk işçisiyle aynı bekleme (push-outbox-worker.ts RECEIPT_DELAY_MS).
const MAKBUZ_GECIKMESI_MS = 15 * 60 * 1000;

export type DuyuruKitlesi = 'all' | 'savers' | 'list';

export interface DuyuruCihazi {
  userId: string;
  token: string;
  platform: string;
}

/**
 * Bildirimi açık cihazlar (token başına bir kez). Silinmiş hesaplar ve ortak inceleme
 * hesabı (REVIEW_AUTH_EMAIL) hariç. savers: fiyatı takip edilen ürün kaydedenler;
 * list: yalnız verilen kullanıcı id'leri.
 */
export async function duyuruAlicilari(
  kitle: DuyuruKitlesi,
  listIds: string[] = [],
): Promise<DuyuruCihazi[]> {
  if (kitle === 'list' && listIds.length === 0) return [];
  const saverFilter = sql`exists (select 1 from ${savedProducts} where ${savedProducts.userId} = ${users.id}
  and ${savedProducts.trackedProductId} is not null)`;
  return db
    .selectDistinctOn([pushDevices.expoPushToken], {
      userId: pushDevices.userId,
      token: pushDevices.expoPushToken,
      platform: pushDevices.platform,
    })
    .from(pushDevices)
    .innerJoin(users, eq(users.id, pushDevices.userId))
    .where(
      and(
        eq(pushDevices.enabled, true),
        isNull(users.deletedAt),
        isNotNull(pushDevices.expoPushToken),
        // Ortak inceleme hesabına push gitmez, REVIEW_AUTH_ENABLED ne olursa olsun:
        // kuyruk işçisindeki kuralın aynısı (push-outbox-worker.ts). E-postası
        // olmayan hesap bu kuraldan etkilenmez.
        sql`${users.email} is distinct from ${env.REVIEW_AUTH_EMAIL}`,
        ...(kitle === 'savers' ? [saverFilter] : []),
        ...(kitle === 'list' ? [inArray(users.id, listIds)] : []),
      ),
    );
}

/** Uygulaması silinmiş cihazın token'ını kapatır; sonraki duyurular ona gitmez. */
async function tokeniKapat(d: DuyuruCihazi): Promise<void> {
  try {
    await db
      .update(pushDevices)
      .set({ enabled: false, updatedAt: new Date() })
      .where(and(eq(pushDevices.userId, d.userId), eq(pushDevices.expoPushToken, d.token)));
  } catch {
    logger.error('duyuru: token kapatılamadı');
  }
}

/**
 * Makbuz sonucunu PostHog'a yazar: ok → push_delivered, hata → push_failed.
 * DeviceNotRegistered (uygulama silinmiş) → token kapatılır.
 */
export async function duyuruMakbuzlariniIsle(
  gonderilen: { cihaz: DuyuruCihazi; ticketId: string }[],
  p: { campaign: string },
  oku: (ids: string[]) => Promise<Map<string, ExpoResult>> = readExpoReceipts,
): Promise<{ teslim: number; hata: number; okunamayan: number }> {
  const makbuzlar = await oku(gonderilen.map((g) => g.ticketId));
  let teslim = 0;
  let hata = 0;
  let okunamayan = 0;
  for (const { cihaz, ticketId } of gonderilen) {
    const r = makbuzlar.get(ticketId);
    if (!r || r.status === 'missing') {
      okunamayan += 1;
    } else if (r.status === 'ok') {
      teslim += 1;
      captureServerEvent(cihaz.userId, 'push_delivered', {
        notification_type: 'announcement',
        campaign: p.campaign,
      });
    } else {
      hata += 1;
      captureServerEvent(cihaz.userId, 'push_failed', {
        notification_type: 'announcement',
        campaign: p.campaign,
        error_code: r.code,
        stage: 'receipt',
      });
      if (r.code === 'DeviceNotRegistered') await tokeniKapat(cihaz);
    }
  }
  return { teslim, hata, okunamayan };
}

/**
 * Cihazlara tek tek gönderir; her sonucu PostHog'a push_sent/push_failed olarak yazar.
 * 15 dk sonra makbuzları okuyup push_delivered/push_failed yazar (bkz. duyuruMakbuzlariniIsle).
 * Makbuz denetimi bu süreçte bekler: süreç o arada kapanırsa (yeniden başlatma, betik) atlanır.
 */
export async function duyuruGonder(
  cihazlar: DuyuruCihazi[],
  p: { title: string; body: string; campaign: string; target?: string | null },
): Promise<{ ok: number; errors: Record<string, number> }> {
  const message = {
    title: p.title,
    body: p.body,
    sound: 'default',
    priority: 'high',
    channelId: 'price-drops-v2',
    // target: dokununca uygulamada ne açılsın (bkz. @butika/types bildirimHedefiCoz).
    data: { type: 'announcement', campaign: p.campaign, ...(p.target ? { target: p.target } : {}) },
  };
  let ok = 0;
  const errors: Record<string, number> = {};
  const gonderilen: { cihaz: DuyuruCihazi; ticketId: string }[] = [];
  for (const d of cihazlar) {
    const result = await sendExpoMessage(d.token, message);
    if (result.status === 'ok') {
      ok += 1;
      if (result.id) gonderilen.push({ cihaz: d, ticketId: result.id });
      captureServerEvent(d.userId, 'push_sent', {
        notification_type: 'announcement',
        campaign: p.campaign,
      });
    } else {
      const code = result.status === 'error' ? result.code : 'missing';
      errors[code] = (errors[code] ?? 0) + 1;
      captureServerEvent(d.userId, 'push_failed', {
        notification_type: 'announcement',
        campaign: p.campaign,
        error_code: code,
        stage: 'ticket',
      });
      if (code === 'DeviceNotRegistered') await tokeniKapat(d);
    }
  }
  if (gonderilen.length > 0) {
    setTimeout(() => {
      duyuruMakbuzlariniIsle(gonderilen, p)
        .then((s) => logger.info({ campaign: p.campaign, ...s }, 'duyuru makbuzları işlendi'))
        .catch(() => logger.error({ campaign: p.campaign }, 'duyuru makbuzları okunamadı'));
    }, MAKBUZ_GECIKMESI_MS).unref();
  }
  return { ok, errors };
}
