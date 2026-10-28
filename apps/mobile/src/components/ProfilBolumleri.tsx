import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { PostHogMaskView } from 'posthog-react-native';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useProfilOzet } from '../api/profil';
import type { User } from '../stores/auth';
import { useAuthStore } from '../stores/auth';
import { theme } from '../theme';

// Eskiden Profil sekmesinde duran bölümler; artık Ayarlar ekranında (⚙).
// Bildirim akışı Kayıtlı sekmesindeki "Bildirimler" kutusuna taşındı.

// Bölüm başlığı çizimleri — kategori kapaklarıyla aynı dil (scripts/profil-ikon.py).
const IKON = {
  tarz: require('../../assets/profil/tarz.png'),
} as const;

// İstatistik etiketi parçalarını üretir; cinsiyet metni i18n'den dışarıdan gelir.
function statsLabel(user: User, genderFemale: string, genderMale: string): string | null {
  const parts: string[] = [];
  if (user.gender === 'female') parts.push(genderFemale);
  else if (user.gender === 'male') parts.push(genderMale);
  if (user.heightCm != null) parts.push(`${user.heightCm} cm`);
  if (user.weightKg != null) parts.push(`${user.weightKg} kg`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Profil özeti: ad, e-posta, boy/kilo. Ayarlar'ın en üstünde. */
export function ProfilOzeti() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const stats = user ? statsLabel(user, t('profile.genderFemale'), t('profile.genderMale')) : null;

  return (
    <View style={styles.header}>
      <PostHogMaskView style={styles.headerText}>
        <Text style={styles.kicker}>{t('profile.kicker')}</Text>
        <Text style={styles.brand}>{user?.displayName ?? t('profile.displayNameFallback')}</Text>
        {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
        {stats ? <Text style={styles.stats}>{stats}</Text> : null}
      </PostHogMaskView>
    </View>
  );
}

/** Tarzın (Satın Aldıklarım Profil'de; rozetler 1.2.4'te kalktı). */
export function ProfilBolumleri() {
  const { t } = useTranslation();
  const router = useRouter();
  const ozet = useProfilOzet();

  // Ekrana her dönüşte tazele.
  const { refetch: refetchOzet } = ozet;
  useFocusEffect(
    useCallback(() => {
      void refetchOzet();
    }, [refetchOzet]),
  );

  const veri = ozet.data;

  const tarzYaz = (x: { birincil: string | null; ikincil: string | null }) =>
    [x.birincil, x.ikincil].filter(Boolean).join(' + ');
  const testVar = !!veri?.tarz.test;

  return (
    <>
      {/* Tarzın (Ayarlar'ın en üstünde): testi yoksa "Tarz testini yap!", varsa sonuç. */}
      <Section
        title={testVar ? t('profile.styleTitle') : t('profile.styleTitleInvite')}
        ikon="tarz"
        action={testVar ? t('profile.styleRetake') : undefined}
        onAction={() => router.push('/tarz-testi')}
      >
        {!veri?.tarz.test ? (
          <>
            <Text style={styles.empty}>{t('profile.styleInvite')}</Text>
            <Pressable
              onPress={() => router.push('/tarz-testi')}
              style={({ pressed }) => [styles.testCta, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.testCtaLabel}>{t('profile.styleStart')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.styleLabel}>{t('profile.styleByTest')}</Text>
            <Text style={styles.styleValue}>{tarzYaz(veri.tarz.test)}</Text>
            <Text style={[styles.styleLabel, { marginTop: 8 }]}>
              {t('profile.styleByFavorites')}
            </Text>
            {veri.tarz.favori.birincil ? (
              <Text style={styles.styleValueSmall}>{tarzYaz(veri.tarz.favori)}</Text>
            ) : (
              <Text style={styles.empty}>{t('profile.styleFavoritesEmpty')}</Text>
            )}
          </>
        )}
      </Section>
    </>
  );
}

function Section({
  title,
  ikon,
  action,
  onAction,
  children,
}: {
  title: string;
  ikon: keyof typeof IKON;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Image source={IKON[ikon]} style={styles.sectionIcon} contentFit="contain" />
        <Text style={styles.sectionTitle}>{title}</Text>
        {action && onAction ? (
          <Pressable onPress={onAction} hitSlop={8} style={{ marginLeft: 'auto' }}>
            <Text style={styles.sectionAction}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.sectionRule} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8, paddingBottom: 24 },
  headerText: { flex: 1, gap: 4 },
  kicker: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  brand: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 36,
    lineHeight: 40,
    color: theme.colors.ink,
  },
  email: { ...theme.type.caption, color: theme.colors.inkMute },
  stats: { ...theme.type.caption, color: theme.colors.inkFaint, letterSpacing: 0.3 },

  section: {
    paddingTop: 18,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    gap: 10,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: -6 },
  sectionIcon: { width: 30, height: 30 },
  sectionTitle: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 22,
    lineHeight: 26,
    color: theme.colors.ink,
  },
  // Başlığın altındaki kısa altın çizgi — vitrindeki kategori başlığıyla aynı dil.
  sectionRule: {
    width: 28,
    height: 1,
    backgroundColor: theme.colors.gold,
    marginTop: 2,
    marginBottom: 4,
  },
  sectionAction: { ...theme.type.caption, color: theme.colors.gold },

  empty: { ...theme.type.caption, color: theme.colors.inkMute, lineHeight: 20 },

  styleValue: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 26,
    lineHeight: 30,
    color: theme.colors.ink,
  },
  styleValueSmall: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 20,
    lineHeight: 24,
    color: theme.colors.ink,
  },
  styleLabel: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  testCta: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.bordo,
  },
  testCtaLabel: { fontFamily: 'Inter_500Medium', fontSize: 14, color: theme.colors.cream },
});
