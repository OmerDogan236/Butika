import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { buyukHarf } from '../lib/buyuk-harf';
import { theme } from '../theme';

interface Props {
  visible: boolean;
  productTitle?: string;
  boutiqueName?: string;
  onDone: () => void;
}

const { width: SCREEN_W } = Dimensions.get('window');
const LETTERBOX_H = 40;
const TOTAL = 2600; // toplam süre ms

// Tüm cascade tek bir progress (0 → 1) ile interpolation üzerinden sürülüyor.
// Çoklu shared value + withDelay yığını yerine bu deterministik tek-driver
// yaklaşımı Reanimated'in cascade race condition'ından bağımsız.
const F = {
  backdrop: { in0: 0, in1: 0.04, out0: 0.88, out1: 1 },
  letterbox: { in0: 0.02, in1: 0.14, out0: 0.88, out1: 1 },
  heartScale: { start: 0.06, peak: 0.16, end: 0.22 },
  heartOpacity: { in0: 0.06, in1: 0.16, out0: 0.92, out1: 1 },
  glow: { in0: 0.08, peak: 0.18, end: 0.34 },
  flank: { in0: 0.2, in1: 0.32, out0: 0.92, out1: 1 },
  title: { in0: 0.26, in1: 0.42, out0: 0.92, out1: 1 },
  product: { in0: 0.34, in1: 0.5, out0: 0.92, out1: 1 },
  brand: { in0: 0.42, in1: 0.58, out0: 0.92, out1: 1 },
};

export function SaveCelebration({ visible, productTitle, boutiqueName, onDone }: Props) {
  const { t, i18n } = useTranslation();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    progress.value = 0;
    progress.value = withTiming(
      1,
      { duration: TOTAL, easing: Easing.bezier(0.4, 0, 0.2, 1) },
      (finished) => {
        if (finished) runOnJS(onDone)();
      },
    );
  }, [visible, progress, onDone]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [F.backdrop.in0, F.backdrop.in1, F.backdrop.out0, F.backdrop.out1],
      [0, 1, 1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const letterboxTopStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [F.letterbox.in0, F.letterbox.in1, F.letterbox.out0, F.letterbox.out1],
          [-LETTERBOX_H, 0, 0, -LETTERBOX_H],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const letterboxBottomStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [F.letterbox.in0, F.letterbox.in1, F.letterbox.out0, F.letterbox.out1],
          [LETTERBOX_H, 0, 0, LETTERBOX_H],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const heartStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [F.heartOpacity.in0, F.heartOpacity.in1, F.heartOpacity.out0, F.heartOpacity.out1],
      [0, 1, 1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          progress.value,
          [F.heartScale.start, F.heartScale.peak, F.heartScale.end],
          [0.3, 1.22, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [F.glow.in0, F.glow.peak, F.glow.end],
      [0, 0.55, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          progress.value,
          [F.glow.in0, F.glow.end],
          [0.4, 3.4],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const flankLeftStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scaleX: interpolate(
          progress.value,
          [F.flank.in0, F.flank.in1, F.flank.out0, F.flank.out1],
          [0, 1, 1, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const flankRightStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scaleX: interpolate(
          progress.value,
          [F.flank.in0, F.flank.in1, F.flank.out0, F.flank.out1],
          [0, 1, 1, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [F.title.in0, F.title.in1, F.title.out0, F.title.out1],
      [0, 1, 1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [F.title.in0, F.title.in1],
          [20, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const productStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [F.product.in0, F.product.in1, F.product.out0, F.product.out1],
      [0, 1, 1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const brandStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [F.brand.in0, F.brand.in1, F.brand.out0, F.brand.out1],
      [0, 1, 1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [F.brand.in0, F.brand.in1],
          [16, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Krem backdrop — tam ekran kapatır */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />

      {/* Üst ve alt ink letterbox barları — cinematic frame */}
      <Animated.View style={[styles.letterbox, styles.letterboxTop, letterboxTopStyle]} />
      <Animated.View style={[styles.letterbox, styles.letterboxBottom, letterboxBottomStyle]} />

      {/* Center content */}
      <View style={styles.content}>
        <View style={styles.heartRow}>
          <Animated.View style={[styles.flank, styles.flankLeftOrigin, flankLeftStyle]} />
          <View style={styles.heartHolder}>
            <Animated.View style={[styles.glow, glowStyle]} />
            <Animated.View style={heartStyle}>
              <Ionicons name="heart" size={88} color={theme.colors.gold} />
            </Animated.View>
          </View>
          <Animated.View style={[styles.flank, styles.flankRightOrigin, flankRightStyle]} />
        </View>

        <Animated.Text style={[styles.title, titleStyle]}>
          {t('components.saveCelebrationTitle')}
        </Animated.Text>

        {/* Kaydetmenin KARŞILIĞI burada söylenir. Kullanıcının "ne oldu şimdi?"
            diye düşündüğü tek an burası; fayda başka hiçbir yerde ekranda değil. */}
        <Animated.Text style={[styles.benefit, titleStyle]}>
          {t('components.saveCelebrationBenefit')}
        </Animated.Text>

        {(productTitle || boutiqueName) && (
          <Animated.View style={[styles.productWrap, productStyle]}>
            {productTitle ? (
              <Text style={styles.productTitle} numberOfLines={2}>
                {productTitle}
              </Text>
            ) : null}
            {boutiqueName ? (
              <Text style={styles.boutiqueName}>{buyukHarf(boutiqueName, i18n.language)}</Text>
            ) : null}
          </Animated.View>
        )}
      </View>

      <Animated.View style={[styles.brandWrap, brandStyle]}>
        <View style={styles.brandHairlines}>
          <View style={styles.brandFlank} />
          <Text style={styles.brand}>Butika</Text>
          <View style={styles.brandFlank} />
        </View>
        <Text style={styles.brandSub}>{buyukHarf(t('components.brandSub'), i18n.language)}</Text>
      </Animated.View>
    </View>
  );
}

const GLOW_SIZE = 88;
const FLANK_W = Math.min(80, (SCREEN_W - 200) / 2);

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: theme.colors.cream,
  },
  letterbox: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: LETTERBOX_H,
    backgroundColor: theme.colors.bordo,
    zIndex: 2,
  },
  letterboxTop: { top: 0 },
  letterboxBottom: { bottom: 0 },

  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 60,
  },

  heartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    height: 120,
    marginBottom: 28,
  },
  flank: {
    width: FLANK_W,
    height: StyleSheet.hairlineWidth + 0.5,
    backgroundColor: theme.colors.gold,
  },
  flankLeftOrigin: {
    transformOrigin: '100% 50%', // sağ uçtan başlayarak sola doğru "uzar"
  },
  flankRightOrigin: {
    transformOrigin: '0% 50%', // sol uçtan başlayarak sağa doğru "uzar"
  },
  heartHolder: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: theme.colors.gold,
  },

  title: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 60,
    lineHeight: 64,
    color: theme.colors.ink,
    letterSpacing: -0.5,
    textAlign: 'center',
  },

  benefit: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.inkMute,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 32,
    maxWidth: 340,
  },

  productWrap: {
    marginTop: 20,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 24,
  },
  productTitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.inkMute,
    textAlign: 'center',
    maxWidth: 300,
  },
  boutiqueName: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: theme.colors.inkFaint,
    letterSpacing: 2.5,
  },

  brandWrap: {
    position: 'absolute',
    bottom: LETTERBOX_H + 32,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  brandHairlines: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  brandFlank: {
    width: 32,
    height: StyleSheet.hairlineWidth + 0.3,
    backgroundColor: theme.colors.gold,
    opacity: 0.7,
  },
  brand: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 28,
    color: theme.colors.ink,
    letterSpacing: 0.3,
  },
  brandSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: theme.colors.inkMute,
    letterSpacing: 3.5,
  },
});
