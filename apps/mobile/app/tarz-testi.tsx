import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KisaTarzTesti } from '../src/components/KisaTarzTesti';
import type { TestKaynagi } from '../src/lib/kisa-test';
import { theme } from '../src/theme';

// Tarz testi rotası: kısa testi (4 adım) açar. Profil'deki "Teste başla" düğmeleri de buraya gelir.
// Tasarım: docs/superpowers/specs/2026-10-01-kisisel-butika-tasarim.md (§1)

const KAYNAKLAR: readonly TestKaynagi[] = [
  'onboarding',
  'guncelleme',
  'vitrin_karti',
  'siralama_menusu',
  'ayarlar',
  'profil',
];

export default function TarzTestiScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { kaynak } = useLocalSearchParams<{ kaynak?: string }>();
  const gecerliKaynak = KAYNAKLAR.find((k) => k === kaynak) ?? 'profil';

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
      <View style={styles.kapatSatiri}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityLabel={t('tarzTesti.kapatA11y')}
        >
          <Ionicons name="close" size={26} color={theme.colors.ink} />
        </Pressable>
      </View>
      <KisaTarzTesti kaynak={gecerliKaynak} onBitti={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  kapatSatiri: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 24 },
});
