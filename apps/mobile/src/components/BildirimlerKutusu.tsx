import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNotifications, useUnreadNotificationCount } from '../api/notifications';
import { theme } from '../theme';

/**
 * Kayıtlı sekmesinde arama kutusunun altındaki bordo "Bildirimler" kutusu → bildirim ekranı.
 * Eskiden Profil'deki "Sana haber var" bölümünün yerini alır: okunmamış sayısı ve son haber.
 */
export function BildirimlerKutusu() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const okunmamis = useUnreadNotificationCount();
  const bildirimler = useNotifications();

  // Ekrana her dönüşte tazele (sekme rozetiyle aynı sayı).
  const { refetch } = okunmamis;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const sayi = okunmamis.data?.count ?? 0;
  const son = bildirimler.data?.pages[0]?.items[0];
  const sonMetin = son
    ? `${son.productTitle || son.boutiqueName} · ${fiyat(son.newPriceMinor, son.currency, i18n.language)}`
    : null;

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={
        sayi > 0
          ? `${t('saved.notificationsBox')}, ${t('saved.notificationsBoxUnread', { count: sayi })}`
          : t('saved.notificationsBox')
      }
      style={({ pressed }) => [styles.kutu, pressed && { opacity: 0.85 }]}
    >
      <Zil />
      <View style={styles.metin}>
        <Text style={styles.baslik}>{t('saved.notificationsBox')}</Text>
        {sonMetin ? (
          <Text style={styles.alt} numberOfLines={1}>
            {sonMetin}
          </Text>
        ) : null}
      </View>
      {sayi > 0 ? (
        <View style={styles.rozet}>
          <Text style={styles.rozetMetni}>{sayi > 9 ? '9+' : sayi}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={theme.colors.blush} />
    </Pressable>
  );
}

function fiyat(minor: number, currency: string, dil: string): string {
  try {
    return new Intl.NumberFormat(dil, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(minor / 100);
  } catch {
    return `${Math.round(minor / 100)} ${currency}`;
  }
}

/** Küçük çizim: gül kurusu çerçeveli daire içinde zil. */
function Zil() {
  return (
    <View style={styles.zil}>
      <Ionicons name="notifications-outline" size={18} color={theme.colors.blush} />
    </View>
  );
}

const styles = StyleSheet.create({
  kutu: {
    marginHorizontal: 24,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.bordo,
  },
  zil: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metin: { flex: 1, gap: 2 },
  baslik: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 18,
    lineHeight: 22,
    color: theme.colors.blush,
  },
  alt: { ...theme.type.micro, color: theme.colors.blush, opacity: 0.8 },
  rozet: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: theme.colors.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rozetMetni: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.colors.bordo },
});
