import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type DetayliKaynak, DetayliTest } from '../src/components/DetayliTest';
import { theme } from '../src/theme';

// Detaylı test rotası. Vitrin afişi ve Ayarlar buraya gelir.
// Tasarım: docs/superpowers/specs/2026-10-16-detayli-test-tasarim.md (§1, §2)

const KAYNAKLAR: readonly DetayliKaynak[] = ['vitrin_afisi', 'ayarlar'];

export default function DetayliTestScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { kaynak } = useLocalSearchParams<{ kaynak?: string }>();
  const gecerliKaynak = KAYNAKLAR.find((k) => k === kaynak) ?? 'ayarlar';

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
      <View style={styles.kapatSatiri}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityLabel={t('detayliTest.kapatA11y')}
        >
          <Ionicons name="close" size={26} color={theme.colors.ink} />
        </Pressable>
      </View>
      <DetayliTest kaynak={gecerliKaynak} onBitti={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  kapatSatiri: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 24 },
});
