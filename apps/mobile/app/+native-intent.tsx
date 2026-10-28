import { Platform } from 'react-native';
import { linkAcilisiniBildir } from '../src/lib/acilis-kaynagi';
import { isBlockedExternalPath, webLinkToAppPath } from '../src/lib/deep-link';

// Expo Router: işletim sisteminden gelen her bağlantı (butika://… ve butika.ai linkleri) ekrana
// yönlenmeden önce buradan geçer. Uygulamanın kendi içindeki router.push çağrıları bu kuraldan etkilenmez.
export function redirectSystemPath({ path: gelen }: { path: string; initial: boolean }): string {
  let path = gelen;
  try {
    path = webLinkToAppPath(gelen);
  } catch {
    // çevrilemezse olduğu gibi devam
  }
  try {
    // Açılış kaynağı: app_open / app_foregrounded olayına utm bilgisiyle eklenir.
    linkAcilisiniBildir(path);
  } catch {
    // ölçüm yönlendirmeyi asla bozmamalı
  }
  try {
    return isBlockedExternalPath(path, Platform.OS) ? '/' : path;
  } catch {
    return '/';
  }
}
