import { tarafKartRenkleri } from '@butika/design-tokens';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUpdateProfile } from '../src/api/queries';
import { buyukHarf } from '../src/lib/buyuk-harf';
import { useKisiselStore } from '../src/stores/kisisel';
import { useOnboardingStore } from '../src/stores/onboarding';
import { type VitrinCinsiyeti, useVitrinStore } from '../src/stores/vitrin';
import { theme } from '../src/theme';

// 1.2.4: giriş tek sayfa — yalnız KADIN ve ERKEK kartları. Seçim vitrini belirler
// (Keşfet'in üstündeki geçişten sonra da değişir) ve profile cinsiyet olarak yazılır.
// Boy-kilo detaylı tarz testinde; tarz testi, tanıtım videosu ve kategori seçimi yok.
const KARTLAR: { cinsiyet: VitrinCinsiyeti; etiket: string; profil: 'female' | 'male' }[] = [
  { cinsiyet: 'kadin', etiket: 'onboarding.cardWomen', profil: 'female' },
  { cinsiyet: 'erkek', etiket: 'onboarding.cardMen', profil: 'male' },
];

export default function OnboardingScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const complete = useOnboardingStore((s) => s.complete);
  const updateProfile = useUpdateProfile();
  const [secilen, setSecilen] = useState<VitrinCinsiyeti | null>(null);

  async function sec(kart: (typeof KARTLAR)[number]) {
    if (secilen) return;
    setSecilen(kart.cinsiyet);
    Haptics.selectionAsync();
    await updateProfile.mutateAsync({ gender: kart.profil }).catch(() => {});
    // Testi yapmadan geçen kullanıcıya sonraki açılışta zorla test sorulmasın.
    await useKisiselStore.getState().testSorusunuKapat();
    await complete();
    // Erkek seçildiyse renkler değişir, uygulama yeniden yüklenir ve Profil'le açılır.
    await useVitrinStore.getState().sec(kart.cinsiyet, { acilistaProfil: true });
    router.replace('/(tabs)/saved');
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <Text style={styles.marka}>BUTIKA</Text>
      <View style={styles.kartlar}>
        {KARTLAR.map((kart, i) => {
          const aktif = secilen === kart.cinsiyet;
          return (
            <Animated.View
              key={kart.cinsiyet}
              entering={FadeInDown.springify()
                .damping(18)
                .delay(120 + i * 90)}
              style={styles.kartSarma}
            >
              <Pressable
                onPress={() => sec(kart)}
                accessibilityRole="button"
                accessibilityState={{ selected: aktif }}
                style={({ pressed }) => [
                  styles.kart,
                  { backgroundColor: tarafKartRenkleri[kart.cinsiyet].zemin },
                  (aktif || pressed) && { backgroundColor: tarafKartRenkleri[kart.cinsiyet].yazi },
                ]}
              >
                {({ pressed }) => (
                  <Text
                    style={[
                      styles.kartYazi,
                      { color: tarafKartRenkleri[kart.cinsiyet].yazi },
                      (aktif || pressed) && styles.kartYaziAktif,
                    ]}
                  >
                    {buyukHarf(t(kart.etiket), i18n.language)}
                  </Text>
                )}
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
      <Text style={styles.not}>{t('settings.independence')}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.cream,
    paddingHorizontal: 24,
  },
  marka: {
    marginTop: 16,
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: 6,
    color: theme.colors.bordo,
  },
  kartlar: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
  },
  kartSarma: { height: 200 },
  kart: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: theme.colors.bordoZemin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kartYazi: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 28,
    letterSpacing: 8,
    color: theme.colors.bordo,
  },
  kartYaziAktif: { color: theme.colors.cream },
  not: {
    ...theme.type.caption,
    color: theme.colors.inkFaint,
    textAlign: 'center',
    paddingBottom: 12,
  },
});
