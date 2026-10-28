import type { SonTarzTesti } from '@butika/types';
import { useIsMutating } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TARZ_TESTI_GONDER_ANAHTARI } from '../src/api/tarz-testi';
import { KisaTarzTesti } from '../src/components/KisaTarzTesti';
import { TanitimVideosu } from '../src/components/TanitimVideosu';
import { trackKisiselDahaSonra } from '../src/lib/analytics';
import { type KisiselAdim, ertelemeSayilirMi, videoGosterilsinMi } from '../src/lib/kisisel-akis';
import { useKisiselStore } from '../src/stores/kisisel';
import { theme } from '../src/theme';

// Güncelleme sonrası kişisel akış (mevcut kullanıcı): önce kısa test ("Daha sonra" ile ertelenir),
// ardından tanıtım videosu (Türkçe, bir kez). Vitrin odağında açılır; tam ekran, kaydırarak kapanmaz.
// Android geri tuşu: testte "Daha sonra", videoda "görüldü" sayılır.
// Tasarım: docs/superpowers/specs/2026-10-01-kisisel-butika-tasarim.md (§1 Mevcut kullanıcı)

export default function KisiselAkisScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ adim?: string }>();
  const [adim, setAdim] = useState<KisiselAdim | null>(
    params.adim === 'test' || params.adim === 'video' ? params.adim : null,
  );
  const videoGoruldu = useKisiselStore((s) => s.videoGoruldu);
  const dahaSonra = useKisiselStore((s) => s.dahaSonra);
  const videoyuGorduIsaretle = useKisiselStore((s) => s.videoyuGorduIsaretle);
  const gonderiliyor = useIsMutating({ mutationKey: TARZ_TESTI_GONDER_ANAHTARI }) > 0;
  const testKapandi = useRef(false);
  const videoKapandi = useRef(false);

  function kapat() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  // Testten sonra (bitti ya da "Daha sonra"): video sırası geldiyse aynı ekranda video.
  function testSonrasi() {
    if (testKapandi.current) return; // çift dokunuş / geri tuşu tekrar saymasın
    testKapandi.current = true;
    if (videoGosterilsinMi(i18n.language) && !videoGoruldu) setAdim('video');
    else kapat();
  }

  // Test sonuçsuz bitti (her adım atlandı / gönderim hata verdi): "Daha sonra" sayılır,
  // yoksa test her açılışta yeniden sorulur.
  function testBitti(sonuc: SonTarzTesti | null) {
    if (testKapandi.current) return;
    if (ertelemeSayilirMi(sonuc)) void dahaSonra();
    testSonrasi();
  }

  function dahaSonraSec() {
    if (testKapandi.current || gonderiliyor) return;
    trackKisiselDahaSonra();
    void dahaSonra();
    testSonrasi();
  }

  function videoBitti() {
    if (videoKapandi.current) return;
    videoKapandi.current = true;
    void videoyuGorduIsaretle();
    kapat();
  }

  // Geçersiz parametre: gösterecek bir şey yok.
  // biome-ignore lint/correctness/useExhaustiveDependencies: yalnız ilk açılışta karar verilir
  useEffect(() => {
    if (adim === null) kapat();
  }, []);

  // Android donanım geri tuşu: ekranı sessizce kapatmasın, sayılsın (her render'da güncel işleyici).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (adim === 'test') {
        if (!gonderiliyor) dahaSonraSec(); // gönderim sürerken geri tuşu yutulur
        return true;
      }
      if (adim === 'video') {
        videoBitti();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  });

  if (adim === 'video') {
    return <TanitimVideosu kaynak="guncelleme" onBitti={videoBitti} />;
  }

  if (adim === 'test') {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <KisaTarzTesti
          kaynak="guncelleme"
          onBitti={testBitti}
          altEylem={{ etiket: t('kisisel.dahaSonra'), onPress: dahaSonraSec }}
        />
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
});
