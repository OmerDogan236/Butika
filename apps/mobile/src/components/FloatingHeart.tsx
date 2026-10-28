import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { theme } from '../theme';

interface FloatingHeartProps {
  saved: boolean;
  busy: boolean;
  onPress: () => void;
  bottomOffset?: number;
}

// Animated.View dış katman (transform için), Pressable iç katman (touch için).
// AnimatedPressable Android'de "string cannot be cast to double" hatası
// verebiliyor çünkü Pressable'ın fonksiyonel style API'si Reanimated'in
// proxy'siyle çakışıyor.
export function FloatingHeart({ saved, busy, onPress, bottomOffset = 24 }: FloatingHeartProps) {
  const scale = useSharedValue(1);
  const fill = useSharedValue(saved ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(saved ? 1 : 0, { duration: saved ? 260 : 220 });
  }, [saved, fill]);

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    opacity: fill.value,
  }));

  return (
    <Animated.View
      style={[styles.btn, { bottom: bottomOffset }, heartStyle]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => {
          if (busy) return;
          scale.value = withSequence(
            withTiming(0.85, { duration: 80 }),
            withSpring(1.15, { stiffness: 320, damping: 12 }),
            withSpring(1, { stiffness: 220, damping: 16 }),
          );
          onPress();
        }}
        disabled={busy}
        hitSlop={8}
        style={styles.touchArea}
      >
        <Ionicons name="heart-outline" size={28} color={theme.colors.ink} />
        <Animated.View
          style={[StyleSheet.absoluteFillObject, styles.fillWrap, fillStyle]}
          pointerEvents="none"
        >
          <Ionicons name="heart" size={28} color={theme.colors.gold} />
        </Animated.View>
        {busy && (
          <View style={[StyleSheet.absoluteFillObject, styles.busyOverlay]} pointerEvents="none">
            <ActivityIndicator size="small" color={theme.colors.gold} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.cream,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
  },
  touchArea: {
    flex: 1,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fillWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248,245,240,0.85)',
    borderRadius: 28,
  },
});
