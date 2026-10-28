import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureEvent } from '../lib/analytics';
import { theme } from '../theme';

// Sessiz tanıtım videosu: kendiliğinden oynar, "Geç" ile atlanır, bitince "Başlayalım".
// Video açılamazsa "Başlayalım" hemen görünür. Oynatıcıyı useVideoPlayer unmount'ta bırakır.
// Tasarım: docs/superpowers/specs/2026-10-01-kisisel-butika-tasarim.md (§1)
const KAYNAK = require('../../assets/video/butika-rehber.mp4');

export interface TanitimVideosuProps {
  kaynak: 'onboarding' | 'guncelleme';
  onBitti: () => void;
}

export function TanitimVideosu({ kaynak, onBitti }: TanitimVideosuProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(KAYNAK, (p) => {
    p.muted = true;
    p.loop = false;
    p.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [bitti, setBitti] = useState(false);
  const kapandi = useRef(false);

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => setBitti(true));
    return () => sub.remove();
  }, [player]);

  const oynatmaHatasi = status === 'error'; // açılamazsa "Başlayalım" hemen görünür

  function kapat(sonuc: 'izlendi' | 'gecildi') {
    if (kapandi.current) return; // çift dokunuş / Geç + bitiş tekrar tetiklemesin
    kapandi.current = true;
    let saniye = 0;
    try {
      saniye = Math.round(player.currentTime);
    } catch {
      // oynatıcı serbest bırakılmış olabilir
    }
    captureEvent('tanitim_videosu', { kaynak, sonuc, saniye });
    onBitti();
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.ust}>
        <Pressable
          onPress={() => kapat('gecildi')}
          hitSlop={12}
          accessibilityRole="button"
          style={({ pressed }) => [styles.gec, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.gecLabel}>{t('onboarding.videoGec')}</Text>
        </Pressable>
      </View>

      <View style={styles.video}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
        />
      </View>

      <View style={styles.alt}>
        {bitti || oynatmaHatasi ? (
          <Pressable
            onPress={() => kapat('izlendi')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.ctaLabel}>{t('onboarding.videoBasla')}</Text>
          </Pressable>
        ) : null}
        <Text style={styles.beyan}>{t('settings.independence')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  ust: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 24, minHeight: 44 },
  gec: { justifyContent: 'center', minHeight: 44 },
  gecLabel: { fontFamily: 'Inter_500Medium', fontSize: 15, color: theme.colors.inkMute },
  video: { flex: 1 },
  alt: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12, gap: 12 },
  cta: {
    height: 54,
    borderRadius: 8,
    backgroundColor: theme.colors.bordo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: theme.colors.cream,
    letterSpacing: 0.4,
  },
  beyan: {
    ...theme.type.caption,
    fontSize: 10,
    lineHeight: 14,
    color: theme.colors.inkFaint,
    textAlign: 'center',
  },
});
