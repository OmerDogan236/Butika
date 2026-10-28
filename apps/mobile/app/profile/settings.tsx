import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GuncellemeKarti } from '../../src/components/GuncellemeKarti';
import { ProfilBolumleri, ProfilOzeti } from '../../src/components/ProfilBolumleri';
import { api } from '../../src/lib/api';
import { buyukHarf } from '../../src/lib/buyuk-harf';
import { useAuthStore } from '../../src/stores/auth';
import { useOnboardingStore } from '../../src/stores/onboarding';
import { useTurStore } from '../../src/stores/tur';
import { theme } from '../../src/theme';

const PRIVACY_URL = 'https://butika.ai/aydinlatma-metni';
const CONSENT_URL = 'https://butika.ai/acik-riza-metni';
const COOKIE_URL = 'https://butika.ai/cerez-politikasi';
const TERMS_URL = 'https://butika.ai/kullanim-kosullari';

// Sürüm app.json'dan okunur — elle yazılırsa güncellenmeyi unutuluyor.
const APP_VERSION = Constants.expoConfig?.version ?? '';

export default function SettingsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const signOut = useAuthStore((s) => s.signOut);
  const resetOnboarding = useOnboardingStore((s) => s.reset);
  const turuSifirla = useTurStore((s) => s.hepsiniSifirla);
  const insets = useSafeAreaInsets();

  async function handleResetTour() {
    await turuSifirla();
    Alert.alert(t('profile.resetTourDoneTitle'), t('profile.resetTourDoneBody'), [
      { text: t('profile.resetTourOk') },
    ]);
  }

  async function handleResetOnboarding() {
    await resetOnboarding();
    Alert.alert(t('profile.resetDoneTitle'), t('profile.resetDoneBody'), [
      { text: t('profile.resetShowNow'), onPress: () => router.replace('/onboarding') },
      { text: t('profile.resetShowLater'), style: 'cancel' },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(t('profile.deleteConfirmTitle'), t('profile.deleteConfirmBody'), [
      { text: t('profile.deleteCancel'), style: 'cancel' },
      {
        text: t('profile.deleteConfirmCta'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete('/me');
            await signOut();
          } catch {
            Alert.alert(t('profile.deleteFailed'));
          }
        },
      },
    ]);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={theme.colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Eski Profil sekmesinin içeriği: özet, (varsa) güncelleme kartı, profil bölümleri.
            Bildirim akışı Kayıtlı sekmesindeki "Bildirimler" kutusunda. */}
        <ProfilBolumleri />
        <ProfilOzeti />
        <GuncellemeKarti />

        <Text style={[styles.sectionLabel, styles.sectionGap]}>
          {buyukHarf(t('settings.legal'), i18n.language)}
        </Text>
        <Text style={styles.sectionHint}>{t('settings.legalHint')}</Text>
        <View style={styles.options}>
          <Pressable
            style={styles.option}
            onPress={() => {
              Haptics.selectionAsync();
              void Linking.openURL(PRIVACY_URL);
            }}
          >
            <Ionicons name="document-text-outline" size={20} color={theme.colors.inkMute} />
            <Text style={styles.optionLabel}>{t('settings.privacyPolicy')}</Text>
            <Ionicons
              name="open-outline"
              size={18}
              color={theme.colors.inkFaint}
              style={{ marginLeft: 'auto' }}
            />
          </Pressable>
          <Pressable
            style={styles.option}
            onPress={() => {
              Haptics.selectionAsync();
              void Linking.openURL(CONSENT_URL);
            }}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.inkMute} />
            <Text style={styles.optionLabel}>{t('settings.consentText')}</Text>
            <Ionicons
              name="open-outline"
              size={18}
              color={theme.colors.inkFaint}
              style={{ marginLeft: 'auto' }}
            />
          </Pressable>
          <Pressable
            style={styles.option}
            onPress={() => {
              Haptics.selectionAsync();
              void Linking.openURL(COOKIE_URL);
            }}
          >
            <Ionicons name="ellipse-outline" size={20} color={theme.colors.inkMute} />
            <Text style={styles.optionLabel}>{t('settings.cookiePolicy')}</Text>
            <Ionicons
              name="open-outline"
              size={18}
              color={theme.colors.inkFaint}
              style={{ marginLeft: 'auto' }}
            />
          </Pressable>
          <Pressable
            style={styles.option}
            onPress={() => {
              Haptics.selectionAsync();
              void Linking.openURL(TERMS_URL);
            }}
          >
            <Ionicons name="reader-outline" size={20} color={theme.colors.inkMute} />
            <Text style={styles.optionLabel}>{t('settings.terms')}</Text>
            <Ionicons
              name="open-outline"
              size={18}
              color={theme.colors.inkFaint}
              style={{ marginLeft: 'auto' }}
            />
          </Pressable>
        </View>

        {/* Bağımsızlık beyanı — yasal bağlantıların hemen altında durur ki
            marka adlarını gören kullanıcı ilişkinin niteliğini görebilsin. */}
        <Text style={styles.independence}>{t('settings.independence')}</Text>

        <Text style={[styles.sectionLabel, styles.sectionGap]}>
          {buyukHarf(t('settings.account'), i18n.language)}
        </Text>
        <View style={styles.options}>
          <Pressable
            style={styles.option}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/profile/edit');
            }}
          >
            <Ionicons name="person-outline" size={20} color={theme.colors.inkMute} />
            <Text style={styles.optionLabel}>{t('profile.editProfile')}</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.inkFaint}
              style={{ marginLeft: 'auto' }}
            />
          </Pressable>
          <Pressable
            style={styles.option}
            onPress={() => {
              Haptics.selectionAsync();
              router.push({ pathname: '/tarz-testi', params: { kaynak: 'ayarlar' } });
            }}
          >
            <Ionicons name="star-outline" size={20} color={theme.colors.inkMute} />
            <Text style={styles.optionLabel}>{t('settings.myStyle')}</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.inkFaint}
              style={{ marginLeft: 'auto' }}
            />
          </Pressable>
          <Pressable
            style={styles.option}
            onPress={() => {
              Haptics.selectionAsync();
              router.push({ pathname: '/detayli-test', params: { kaynak: 'ayarlar' } });
            }}
          >
            <Ionicons name="list-outline" size={20} color={theme.colors.inkMute} />
            <Text style={styles.optionLabel}>{t('settings.detailedTest')}</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.inkFaint}
              style={{ marginLeft: 'auto' }}
            />
          </Pressable>
          <Pressable style={styles.option} onPress={handleResetTour}>
            <Ionicons name="refresh-outline" size={20} color={theme.colors.inkMute} />
            <Text style={styles.optionLabel}>{t('profile.resetTour')}</Text>
          </Pressable>
          {__DEV__ ? (
            <Pressable style={styles.option} onPress={handleResetOnboarding}>
              <Ionicons name="refresh-circle-outline" size={20} color={theme.colors.inkMute} />
              <Text style={styles.optionLabel}>{t('profile.resetOnboarding')}</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.option} onPress={() => signOut()}>
            <Ionicons name="log-out-outline" size={20} color={theme.colors.inkMute} />
            <Text style={styles.optionLabel}>{t('profile.signOut')}</Text>
          </Pressable>
          <Pressable style={styles.option} onPress={handleDeleteAccount}>
            <Ionicons name="trash-outline" size={20} color={theme.colors.clay} />
            <Text style={[styles.optionLabel, { color: theme.colors.clay }]}>
              {t('profile.deleteAccount')}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.version}>Butika v{APP_VERSION}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  version: {
    paddingTop: 28,
    textAlign: 'center',
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 2,
  },
  root: {
    flex: 1,
    backgroundColor: theme.colors.cream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 24,
    color: theme.colors.ink,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  sectionLabel: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 3,
  },
  sectionGap: {
    marginTop: 36,
  },
  sectionHint: {
    ...theme.type.body,
    color: theme.colors.inkFaint,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 14,
  },
  independence: {
    ...theme.type.body,
    color: theme.colors.inkFaint,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
  },
  options: {
    gap: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 54,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    backgroundColor: theme.colors.cream,
  },
  optionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: theme.colors.inkMute,
  },
});
