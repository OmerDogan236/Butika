import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { buyukHarf } from '../lib/buyuk-harf';
import { theme } from '../theme';

/**
 * Kategori rafı kapalıyken sol kenarda kalan ince şerit. Dokununca raf geri açılır.
 * Yazı 90° döndürülür; döndürme ölçüyü değiştirmediği için yazı kendi kutusunda
 * (genişliği yüksekliği kadar) ortalanır.
 */
const STRIP_LABEL_BOX = 160;

export function CategoryRailStrip({ onExpand }: { onExpand: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <Pressable
      onPress={onExpand}
      accessibilityRole="button"
      accessibilityLabel={t('showcase.railExpand')}
      style={({ pressed }) => [styles.root, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name="chevron-forward" size={15} color={theme.colors.inkMute} />
      <View style={styles.labelBox}>
        <Text numberOfLines={1} style={styles.label}>
          {buyukHarf(t('showcase.railTitle'), i18n.language)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 12,
  },
  // Döndürme ölçüyü değiştirmez: yazı kutunun TAM ORTASINDA durmalı ki 36px'lik
  // şeritte görünsün (kenarda kalırsa kırpılır).
  labelBox: {
    width: STRIP_LABEL_BOX,
    height: STRIP_LABEL_BOX,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '90deg' }],
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.6,
    color: theme.colors.ink,
  },
});
