import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { trackKisiselDavet } from '../lib/analytics';
import { buyukHarf } from '../lib/buyuk-harf';
import { theme } from '../theme';

interface Props {
  onBasla: () => void;
  onKapat: () => void;
}

/** Vitrinde, tarz testi yapmamış kullanıcıya tek seferlik davet (çarpıyla kapanır). */
export function KisiselDavetKarti({ onBasla, onKapat }: Props) {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    trackKisiselDavet({ eylem: 'gorundu' });
  }, []);
  return (
    <View style={styles.kart}>
      <Pressable
        onPress={onBasla}
        accessibilityRole="button"
        style={({ pressed }) => [styles.icerik, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.kicker}>{buyukHarf(t('showcase.inviteSub'), i18n.language)}</Text>
        <Text style={styles.baslik}>{t('showcase.inviteTitle')}</Text>
      </Pressable>
      <Pressable
        onPress={onKapat}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        style={({ pressed }) => [styles.kapat, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="close" size={16} color={theme.colors.inkMute} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  kart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 24,
    marginBottom: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.bordo,
    backgroundColor: theme.colors.creamSoft,
  },
  icerik: { flex: 1, gap: 4 },
  kicker: { ...theme.type.micro, color: theme.colors.bordo, letterSpacing: 2 },
  baslik: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 16,
    lineHeight: 20,
    color: theme.colors.ink,
  },
  kapat: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
