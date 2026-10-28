import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KoleksiyonIzgarasi } from '../../src/components/KoleksiyonIzgarasi';
import { buyukHarf } from '../../src/lib/buyuk-harf';
import { theme } from '../../src/theme';

// 1.2.4'ten beri sekme çubuğunda görünmez (koleksiyonlar Profil'in içinde);
// eski bağlantılar için ekran yerinde duruyor.
export default function CollectionsScreen() {
  const { t, i18n } = useTranslation();
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{buyukHarf(t('collections.kicker'), i18n.language)}</Text>
        <Text style={styles.brand}>{t('collections.brand')}</Text>
      </View>
      <KoleksiyonIzgarasi />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  kicker: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 3,
  },
  brand: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 48,
    lineHeight: 52,
    color: theme.colors.ink,
    marginTop: 4,
  },
});
