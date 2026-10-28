import type { RestockAlert, SavedTracking } from '@butika/types';

export type RestockControl = 'notify' | 'pending' | 'armed';

/** The "Stok gelince haber ver" control of a saved item: offered once the server has seen the size sold out. */
export function restockControl(
  tracking: SavedTracking | undefined,
  alert: RestockAlert | undefined,
): RestockControl | null {
  if (alert === 'pending' || alert === 'armed') return alert;
  return tracking?.status === 'out_of_stock' ? 'notify' : null;
}

export const restockLabelKey: Record<RestockControl, string> = {
  notify: 'saved.restockNotify',
  pending: 'saved.restockPending',
  armed: 'saved.restockArmed',
};

const REFUSALS = new Set(['already_in_stock', 'stock_unknown', 'restock_unavailable']);
/** i18n key explaining why the server refused an alert. */
export const restockErrorKey = (code: string | undefined) =>
  code && REFUSALS.has(code) ? `saved.restock_${code}` : 'saved.restockFailed';

/** Yeni kayıt bu süreden eskiyse artık beklenmez (liste sürekli yenilenmesin). */
export const TAKIP_BEKLEME_MS = 10 * 60 * 1000;

/**
 * Sunucu yeni kaydı henüz hiç kontrol etmediyse (ör. bedensiz tükenmiş ürün) liste kısa aralıkla
 * yenilenir ki alarm düğmesi gecikmesin. Yalnız son 10 dakikada kaydedilen, hiç kontrol edilmemiş
 * ürünler için: zaten takip edilen ürün (checkedAt dolu) stokta değilse "pending" görünmez,
 * dolayısıyla beklemek düğmeyi değiştirmez; eski kayıt için saatlerce yenilemek boşa yük olur.
 */
export const takipBekliyorMu = (
  items: { tracking?: SavedTracking; createdAt: string }[],
  now = Date.now(),
) =>
  items.some(
    (i) =>
      i.tracking?.status === 'pending' &&
      i.tracking.checkedAt === null &&
      now - Date.parse(i.createdAt) < TAKIP_BEKLEME_MS,
  );
