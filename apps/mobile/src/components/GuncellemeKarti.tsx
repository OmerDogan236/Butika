import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVitrinAyarlari } from '../api/queries';
import { magazayiAc } from '../lib/magaza-ac';
import { surumDahaYeniMi } from '../lib/surum';
import { theme } from '../theme';

// Çalışan uygulamanın sürümü: önce mağaza paketinin kendi sürümü, yoksa app.json.
const MEVCUT_SURUM = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null;

/**
 * Ayarlar'ın üstündeki "Yeni sürüm var" kartı. Mağazadaki sürüm (admin: Vitrin ayarları)
 * bu platformda çalışan sürümden yeniyse görünür; değilse hiçbir şey çizmez.
 */
export function GuncellemeKarti() {
  const { t } = useTranslation();
  const ayarlar = useVitrinAyarlari().data;
  const guncel = Platform.OS === 'ios' ? ayarlar?.guncelSurum.ios : ayarlar?.guncelSurum.android;
  if (!surumDahaYeniMi(MEVCUT_SURUM, guncel)) return null;

  return (
    <View style={styles.kart}>
      <TelefonCizimi />
      <View style={styles.metin}>
        <Text style={styles.mevcut} numberOfLines={1}>
          {t('settings.updateCurrent', { version: MEVCUT_SURUM })}
        </Text>
        <Text style={styles.yeni}>{t('settings.updateAvailable')}</Text>
      </View>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          void magazayiAc();
        }}
        accessibilityRole="button"
        hitSlop={6}
        style={({ pressed }) => [styles.buton, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.butonMetni}>{t('settings.updateCta')}</Text>
      </Pressable>
    </View>
  );
}

/** Küçük çizim: gül kurusu daire içinde bordo telefon, ekranında indirme oku. */
function TelefonCizimi() {
  return (
    <View style={styles.cizim}>
      <View style={styles.telefon}>
        <View style={styles.hoparlor} />
        <Ionicons name="arrow-down" size={14} color={theme.colors.bordo} />
        <View style={styles.cizgi} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    backgroundColor: theme.colors.creamSoft,
  },
  cizim: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  telefon: {
    width: 24,
    height: 38,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: theme.colors.bordo,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 3,
    paddingBottom: 3,
    backgroundColor: theme.colors.creamSoft,
  },
  hoparlor: { width: 7, height: 2, borderRadius: 1, backgroundColor: theme.colors.bordo },
  cizgi: { width: 10, height: 2, borderRadius: 1, backgroundColor: theme.colors.bordo },
  metin: { flex: 1, gap: 3 },
  mevcut: { ...theme.type.micro, color: theme.colors.inkMute },
  yeni: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 18,
    color: theme.colors.ink,
  },
  buton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: theme.colors.bordo,
  },
  butonMetni: { fontFamily: 'Inter_500Medium', fontSize: 13, color: theme.colors.blush },
});
