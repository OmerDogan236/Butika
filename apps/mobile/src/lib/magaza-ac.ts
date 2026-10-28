import { Linking, Platform } from 'react-native';
import { MAGAZA_ADRESI } from './surum';

/** Uygulamanın mağaza sayfasını açar (güncelleme kartı ve "guncelleme" hedefli duyuru). */
export async function magazayiAc() {
  if (Platform.OS === 'ios') {
    await Linking.openURL(MAGAZA_ADRESI.ios);
    return;
  }
  // Play Store uygulaması yoksa (ör. emülatör) web sayfasına düş.
  try {
    await Linking.openURL(MAGAZA_ADRESI.android);
  } catch {
    await Linking.openURL(MAGAZA_ADRESI.androidWeb);
  }
}
