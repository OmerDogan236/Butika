import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { buyukHarf } from '../lib/buyuk-harf';
import { theme } from '../theme';

interface Props {
  visible: boolean;
  onBasla: () => void;
  onKapat: () => void;
}

/** Vitrinin üstünde açılan "detaylı test" daveti. Arka plana, çarpıya, "Şimdi değil"e ve geri tuşuna basınca kapanır. */
export function DetayliDavetPenceresi({ visible, onBasla, onKapat }: Props) {
  const { t, i18n } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onKapat}
    >
      <View style={styles.kaplama}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onKapat}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View style={styles.kart}>
          <Pressable
            onPress={onKapat}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={({ pressed }) => [styles.kapat, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="close" size={22} color={theme.colors.ink} />
          </Pressable>
          <Text style={styles.kicker}>{buyukHarf(t('detayliTest.davetUst'), i18n.language)}</Text>
          <Text style={styles.baslik}>{t('detayliTest.davetBaslik')}</Text>
          <Text style={styles.alt}>{t('detayliTest.davetAlt')}</Text>
          <Pressable
            onPress={onBasla}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.ctaLabel}>{t('detayliTest.davetBasla')}</Text>
          </Pressable>
          <Pressable
            onPress={onKapat}
            accessibilityRole="button"
            style={({ pressed }) => [styles.ikincil, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.ikincilLabel}>{t('detayliTest.davetSimdiDegil')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kaplama: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,10,0.55)',
  },
  kart: {
    width: '100%',
    maxWidth: 360,
    margin: 24,
    padding: 24,
    borderRadius: 16,
    backgroundColor: theme.colors.cream,
    gap: 8,
  },
  kapat: {
    alignSelf: 'flex-end',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: { ...theme.type.micro, color: theme.colors.bordo, letterSpacing: 2 },
  baslik: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 26,
    lineHeight: 32,
    color: theme.colors.ink,
  },
  alt: { ...theme.type.caption, color: theme.colors.inkMute, marginBottom: 12 },
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
  ikincil: { alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  ikincilLabel: { fontFamily: 'Inter_500Medium', fontSize: 14, color: theme.colors.inkMute },
});
