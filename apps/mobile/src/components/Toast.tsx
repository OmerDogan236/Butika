import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { buyukHarf } from '../lib/buyuk-harf';
import { theme } from '../theme';

export type ToastTone = 'success' | 'info' | 'error';

interface ToastProps {
  visible: boolean;
  message: string;
  tone?: ToastTone;
  bottomOffset?: number;
  actionLabel?: string;
  onAction?: () => void;
  /** Shows the close button. The toast stays until it is closed or replaced. */
  onClose?: () => void;
}

const TONE_ICONS: Record<ToastTone, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  info: 'notifications',
  error: 'alert-circle',
};

// A Butika notice: burgundy, readable, and it does not leave by itself. The
// owner's test on 29 Sep showed a 1.9 s toast is gone before anyone reads it,
// so every notice now waits for its close button (or for the next notice).
export function Toast({
  visible,
  message,
  tone = 'success',
  bottomOffset = 110,
  actionLabel,
  onAction,
  onClose,
}: ToastProps) {
  const { t, i18n } = useTranslation();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);
  const hasAction = !!(actionLabel && onAction);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: visible ? 180 : 160 });
    translateY.value = withTiming(visible ? 0 : 8, { duration: visible ? 180 : 160 });
  }, [visible, opacity, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[styles.wrap, { bottom: bottomOffset }, style]}
    >
      <View style={styles.pill} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <Ionicons name={TONE_ICONS[tone]} size={18} color={theme.colors.blush} />
        <View style={styles.body}>
          <Text style={styles.label}>{message}</Text>
          {hasAction ? (
            <Pressable
              onPress={onAction}
              hitSlop={8}
              style={({ pressed }) => [styles.actionWrap, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.actionLabel}>
                {actionLabel ? buyukHarf(actionLabel, i18n.language) : null}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {onClose ? (
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="close" size={20} color={theme.colors.blush} />
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    // A long message wraps inside the screen instead of running off both edges.
    paddingHorizontal: 16,
  },
  pill: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: theme.colors.bordo,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 12,
    borderRadius: 16,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  body: {
    flex: 1,
    gap: 8,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.blush,
  },
  actionWrap: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  actionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 1.5,
    color: theme.colors.blush,
    textDecorationLine: 'underline',
  },
  close: {
    marginTop: -1,
  },
});
