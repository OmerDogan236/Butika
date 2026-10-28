import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '../src/lib/api';
import { recordConsents } from '../src/lib/consent';
import { AuthCancelled } from '../src/lib/social-auth';
import { useAuthStore } from '../src/stores/auth';
import { useLocaleStore } from '../src/stores/locale';
import { theme } from '../src/theme';

const PRIVACY_URL = 'https://butika.ai/aydinlatma-metni';
const TERMS_URL = 'https://butika.ai/kullanim-kosullari';

export default function AuthScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const appleSignIn = useAuthStore((s) => s.appleSignIn);
  const googleSignIn = useAuthStore((s) => s.googleSignIn);
  const devSignIn = useAuthStore((s) => s.devSignIn);
  const reviewSignIn = useAuthStore((s) => s.reviewSignIn);
  const locale = useLocaleStore((s) => s.language);
  const [submitting, setSubmitting] = useState(false);
  const [kvkkConsent, setKvkkConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  // Mağaza inceleme girişi: yalnız sunucu açıkken görünür.
  // Sunucudan kapatılınca uygulamanın yeni sürümü gerekmeden kaybolur.
  const [reviewEnabled, setReviewEnabled] = useState(false);

  useEffect(() => {
    api
      .get<{ reviewAuthEnabled: boolean }>('/auth/config')
      .then((cfg) => setReviewEnabled(cfg.reviewAuthEnabled === true))
      .catch(() => {}); // ulaşılamazsa buton görünmez — sessizce geç
  }, []);

  // KVKK açık rıza zorunlu — işaretli değilse girişi engelle.
  function ensureConsent(): boolean {
    if (!kvkkConsent) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(t('auth.consentRequiredTitle'), t('auth.consentRequiredBody'));
      return false;
    }
    return true;
  }

  // Kayıt rızasını ortak /consent defterine yaz (best-effort — girişi kilitlemez).
  function recordSignupConsents() {
    const user = useAuthStore.getState().user;
    recordConsents({
      email: user?.email ?? undefined,
      userId: user?.id,
      source: 'mobil_kayit',
      locale: locale === 'en' ? 'en' : 'tr',
      consents: [
        { type: 'kvkk_acik_riza', granted: true },
        // Analitik ölçüm uygulamada zorunlu onay kapsamında (bkz. butika.ai/acik-riza-metni m.2).
        { type: 'cerez_analitik', granted: true },
        { type: 'ticari_ileti', granted: marketingConsent },
      ],
    }).catch(() => {});
  }

  // Ortak giriş sarmalayıcı: onay kontrolü → giriş → rıza kaydı → yönlendir.
  // İptal (AuthCancelled) hata değildir; kullanıcıya hata gösterilmez.
  async function runSignIn(fn: () => Promise<void>) {
    if (!ensureConsent()) return;
    setSubmitting(true);
    try {
      await fn();
      recordSignupConsents();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (err) {
      if (err instanceof AuthCancelled) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('auth.signInFailed'), err instanceof Error ? err.message : t('auth.tryAgain'));
    } finally {
      setSubmitting(false);
    }
  }

  const handleApple = () => runSignIn(() => appleSignIn());
  const handleGoogle = () => runSignIn(() => googleSignIn());
  const handleDev = () =>
    runSignIn(() => devSignIn('dev@butika.local', 'Butika Developer', 'TR'));
  const handleReview = () => runSignIn(() => reviewSignIn());

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Küçük ekranlarda / büyük yazı tipi ayarında onay metinleri taşıyordu:
          içerik kaydırılabilir olmalı, yoksa giriş butonları ekran dışında kalıyor. */}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.root}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerWrap}>
          <Text style={styles.kicker}>BUTIKA</Text>
          <Text style={styles.brand}>{t('auth.brand')}</Text>
          <View style={styles.rule} />
          <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
        </View>

        <View style={styles.actions}>
          <View style={styles.consentBlock}>
            <Pressable style={styles.consentRow} onPress={() => setKvkkConsent((v) => !v)}>
              <Ionicons
                name={kvkkConsent ? 'checkbox' : 'square-outline'}
                size={22}
                color={kvkkConsent ? theme.colors.gold : theme.colors.inkFaint}
              />
              <Text style={styles.consentText}>
                {t('auth.consentKvkk')}{' '}
                <Text style={styles.consentLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
                  ({t('auth.privacyLink')})
                </Text>
              </Text>
            </Pressable>
            <Pressable style={styles.consentRow} onPress={() => setMarketingConsent((v) => !v)}>
              <Ionicons
                name={marketingConsent ? 'checkbox' : 'square-outline'}
                size={22}
                color={marketingConsent ? theme.colors.gold : theme.colors.inkFaint}
              />
              <Text style={styles.consentText}>{t('auth.consentMarketing')}</Text>
            </Pressable>
          </View>

          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={6}
              style={styles.appleNativeButton}
              onPress={handleApple}
            />
          )}
          <Pressable
            style={[styles.googleButton, submitting && { opacity: 0.6 }]}
            onPress={handleGoogle}
            disabled={submitting}
          >
            <Ionicons name="logo-google" size={18} color={theme.colors.ink} />
            <Text style={styles.googleLabel}>{t('auth.google')}</Text>
          </Pressable>

          {__DEV__ && (
            <Pressable
              style={[styles.reviewButton, submitting && { opacity: 0.6 }]}
              onPress={handleDev}
              disabled={submitting}
            >
              <Ionicons name="construct-outline" size={18} color={theme.colors.inkMute} />
              <Text style={styles.reviewLabel}>Geliştirici Girişi</Text>
            </Pressable>
          )}

          {reviewEnabled && (
            <Pressable
              style={[styles.reviewButton, submitting && { opacity: 0.6 }]}
              onPress={handleReview}
              disabled={submitting}
            >
              <Ionicons name="eye-outline" size={18} color={theme.colors.inkMute} />
              <Text style={styles.reviewLabel}>{t('auth.review')}</Text>
            </Pressable>
          )}

          {submitting && Platform.OS !== 'ios' && (
            <ActivityIndicator color={theme.colors.gold} style={{ marginTop: 8 }} />
          )}
        </View>

        <Text style={styles.legal}>
          {t('auth.termsPrefix')}
          <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>
            {t('auth.termsLink')}
          </Text>
          {t('auth.termsSuffix')}
          <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
            {t('auth.termsPrivacyLink')}
          </Text>
          {t('auth.termsEnd')}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.cream,
  },
  root: {
    flexGrow: 1,
    backgroundColor: theme.colors.cream,
    paddingHorizontal: 32,
    paddingTop: 72,
    paddingBottom: 32,
  },
  headerWrap: {
    alignItems: 'center',
    gap: 18,
  },
  // Keşfet'teki BUTIKA ile aynı (sahip: her yerde tek biçim).
  kicker: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: 6,
    color: theme.colors.bordo,
  },
  brand: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 56,
    lineHeight: 58,
    color: theme.colors.ink,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    width: 80,
    backgroundColor: theme.colors.gold,
    marginTop: 12,
  },
  subtitle: {
    ...theme.type.body,
    color: theme.colors.inkMute,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 26,
  },
  actions: {
    marginTop: 40,
    gap: 14,
    marginBottom: 28,
  },
  consentBlock: {
    gap: 12,
    marginBottom: 8,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  consentText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.inkMute,
  },
  consentLink: {
    color: theme.colors.gold,
    textDecorationLine: 'underline',
  },
  appleNativeButton: {
    height: 54,
    width: '100%',
  },
  googleButton: {
    height: 54,
    backgroundColor: theme.colors.cream,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    gap: 10,
  },
  googleLabel: {
    fontFamily: 'Inter_500Medium',
    color: theme.colors.ink,
    fontSize: 16,
    letterSpacing: 0.2,
  },
  // Mağaza inceleme girişi — diğer iki butondan görsel olarak ayrışsın diye
  // daha sönük; zaten yalnız inceleme sırasında görünür.
  reviewButton: {
    height: 48,
    marginTop: 10,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.inkFaint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    gap: 10,
  },
  reviewLabel: {
    fontFamily: 'Inter_400Regular',
    color: theme.colors.inkMute,
    fontSize: 15,
    letterSpacing: 0.2,
  },
  legal: {
    ...theme.type.caption,
    color: theme.colors.inkFaint,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 18,
  },
  legalLink: {
    color: theme.colors.gold,
    textDecorationLine: 'underline',
  },
});
