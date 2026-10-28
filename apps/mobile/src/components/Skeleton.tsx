import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { theme } from '../theme';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  radius?: number;
  style?: ViewStyle;
  aspectRatio?: number;
}

// Editorial nefes alan shimmer — krem/mist tonları arasında 1.4s döngü.
// Gold yok (yükleme sessiz olmalı).
export function Skeleton({ width, height, radius = 4, style, aspectRatio }: SkeletonProps) {
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius: radius, aspectRatio } as ViewStyle,
        animStyle,
        style,
      ]}
    />
  );
}

export function SkeletonText({
  width = '60%',
  height = 12,
}: { width?: SkeletonProps['width']; height?: number }) {
  return <Skeleton width={width} height={height} radius={2} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.colors.mist,
  },
});
