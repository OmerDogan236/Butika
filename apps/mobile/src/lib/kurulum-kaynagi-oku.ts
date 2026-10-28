import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { captureEvent } from './analytics';
import { kurulumYuku } from './kurulum-kaynagi';

// Bu kurulumda kaynak bir kez okunur; uygulama silinip yeniden kurulursa yeniden okunur
// (kişi özelliği yine de $set_once: ilk kurulumun kaynağı kalır).
const OKUNDU_KEY = 'butika.kurulumKaynagiOkundu';

/** İlk açılışta install_attributed olayını gönderir; sonraki açılışlarda bir şey yapmaz. */
export async function kurulumKaynaginiKaydet(): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  try {
    if (await AsyncStorage.getItem(OKUNDU_KEY)) return;
    let referrer: string | null = null;
    if (Platform.OS === 'android') {
      try {
        referrer = await Application.getInstallReferrerAsync();
      } catch {
        // Play hizmeti yok (ör. emülatör) ya da yanıt vermedi: kaynak bilinmiyor
      }
    }
    captureEvent('install_attributed', kurulumYuku(Platform.OS, referrer));
    await AsyncStorage.setItem(OKUNDU_KEY, '1');
  } catch {
    // ölçüm; uygulamayı etkilemez
  }
}
