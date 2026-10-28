// Bildirim izninin PostHog'a giden tek adı. Expo'nun "status" alanı iOS'taki geçici
// (provisional) izni "granted" sayar; burada ayrı tutulur.
export type IzinDegeri = 'granted' | 'denied' | 'provisional' | 'not_determined';

// expo-notifications IosAuthorizationStatus: 0 NOT_DETERMINED, 1 DENIED, 2 AUTHORIZED,
// 3 PROVISIONAL, 4 EPHEMERAL (App Clip). Sayılar burada; modülü testte yüklememek için.
const IOS_PROVISIONAL = 3;

export function izinDegeri(izin: { status: string; ios?: { status?: number } | null }): IzinDegeri {
  if (izin.ios?.status === IOS_PROVISIONAL) return 'provisional';
  if (izin.status === 'granted') return 'granted';
  if (izin.status === 'denied') return 'denied';
  return 'not_determined';
}

/** Son bilinen değerden farklıysa değişim; ilk kez görülüyorsa (önceki yok) değişim sayılmaz. */
export function izinDegisimi(
  onceki: string | null,
  simdi: IzinDegeri,
): { from: string; to: IzinDegeri } | null {
  return onceki !== null && onceki !== simdi ? { from: onceki, to: simdi } : null;
}
