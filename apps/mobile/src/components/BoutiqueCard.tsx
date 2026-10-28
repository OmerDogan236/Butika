import { Image, type ImageLoadEventData } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { Boutique } from '../api/queries';
import { isLogoLike } from '../lib/imageFit';
import { theme } from '../theme';

interface BoutiqueCardProps {
  boutique: Boutique;
  onPress: () => void;
  /** Dar kolon (vitrindeki sol raf düzeni): başlık ve boşluklar küçülür. */
  compact?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function BoutiqueCard({ boutique, onPress, compact = false }: BoutiqueCardProps) {
  const pressed = useSharedValue(0);
  // Kapak logo/banner mı foto mu? Logo ise kırpma, sığdır.
  const [isLogo, setIsLogo] = useState(false);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.02 }],
  }));

  function onLoad(e: ImageLoadEventData) {
    setIsLogo(isLogoLike(e.source?.width ?? 0, e.source?.height ?? 0));
  }

  return (
    <AnimatedPressable
      style={[styles.root, compact && styles.rootCompact, animStyle]}
      onPress={onPress}
      onPressIn={() => {
        pressed.value = withSpring(1, theme.motion.spring.snappy);
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, theme.motion.spring.snappy);
      }}
    >
      <View style={[styles.cover, isLogo && styles.coverLogo]}>
        <Image
          source={boutique.coverImageUrl}
          recyclingKey={boutique.id}
          style={styles.img}
          contentFit={isLogo ? 'contain' : 'cover'}
          onLoad={onLoad}
          transition={300}
        />
      </View>
      <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={2}>
        {boutique.name}
      </Text>
      {boutique.description ? (
        <Text style={styles.desc} numberOfLines={2}>
          {boutique.description}
        </Text>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: 10,
  },
  rootCompact: {
    gap: 7,
  },
  cover: {
    width: '100%',
    aspectRatio: 4 / 5,
    backgroundColor: theme.colors.mist,
    overflow: 'hidden',
    borderRadius: 4,
  },
  coverLogo: {
    backgroundColor: theme.colors.creamSoft,
    padding: '14%',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  // Kart adı sade yazıyla (Lyst kartlarındaki marka adı gibi); başlıklar serif.
  title: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    lineHeight: 20,
    color: theme.colors.ink,
  },
  titleCompact: {
    fontSize: 14,
    lineHeight: 17,
  },
  desc: {
    ...theme.type.caption,
    color: theme.colors.inkMute,
  },
});
