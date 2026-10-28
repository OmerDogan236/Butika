import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordConsents } from './consent';

// Butikcan yapay zekâ aktarım onayı (Apple 5.1.2(i) + Açık Rıza m.1).
// Cihazda kullanıcı bazında tutulur: aynı telefonda başka hesapla girilirse yeniden sorulur.
// İspat kaydı sunucudaki rıza defterine yazılır; sunucu beden bilgisini ancak bu kayıt varsa
// Gemini'ye gönderir.
const keyFor = (userId: string) => `butika.butikcan.aiConsent.${userId}`;
// Açık Rıza m.1'in (yapay zekâ) metni değişince artır; diğer maddeler değişince (CONSENT_VERSION)
// Butikcan onayı yeniden sorulmasın. v3: m.1'in son değiştiği sürüm (15.09.2026).
const AI_ONAY_SURUMU = 'v3';

export async function hasAiConsent(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(keyFor(userId))) === AI_ONAY_SURUMU;
  } catch {
    return false;
  }
}

export async function grantAiConsent(userId: string, locale: 'tr' | 'en'): Promise<void> {
  await AsyncStorage.setItem(keyFor(userId), AI_ONAY_SURUMU).catch(() => {});
  // Defter kaydı best-effort: yazılamazsa sohbet yine çalışır ama sunucu beden bilgisini göndermez.
  await recordConsents({
    userId,
    source: 'mobil_butikcan',
    locale,
    consents: [{ type: 'yapay_zeka_aktarim', granted: true }],
  }).catch(() => {});
}
