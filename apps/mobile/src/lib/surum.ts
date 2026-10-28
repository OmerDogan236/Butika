// "Yeni sürüm var" kartı: mağazadaki sürüm uygulamanınkinden yeni mi?
// Yalnız üç parçalı sayısal sürüm ("1.2.0") karşılaştırılır; boş ya da bozuk
// değerde kart çıkmasın diye false döner.

function parcala(surum: string | null | undefined): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(surum?.trim() ?? '');
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function surumDahaYeniMi(
  mevcut: string | null | undefined,
  guncel: string | null | undefined,
): boolean {
  const a = parcala(mevcut);
  const b = parcala(guncel);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (b[i] !== a[i]) return (b[i] ?? 0) > (a[i] ?? 0);
  }
  return false;
}

/** Mağaza sayfası: iOS'ta App Store; Android'de önce Play uygulaması, olmazsa web. */
export const MAGAZA_ADRESI = {
  ios: 'https://apps.apple.com/app/id6811413788',
  android: 'market://details?id=app.butika',
  androidWeb: 'https://play.google.com/store/apps/details?id=app.butika',
} as const;
