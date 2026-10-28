import type { AppNotification } from '@butika/types';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNotifications, useReadNotification } from '../src/api/notifications';
import { Screen } from '../src/components/Screen';
import { trackBoutiqueOutboundClick } from '../src/lib/analytics';
import { webviewRoute } from '../src/lib/route-text';
import { theme } from '../src/theme';

export default function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const query = useNotifications();
  const markRead = useReadNotification();
  const { refetch } = query;
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const price = (minor: number, currency: string) => {
    try {
      return new Intl.NumberFormat(i18n.language, { style: 'currency', currency }).format(minor / 100);
    } catch { return `${(minor / 100).toFixed(2)} ${currency}`; }
  };

  function open(item: AppNotification) {
    if (!item.readAt) markRead.mutate(item.id, {
      onError: () => Alert.alert(t('notifications.readError')),
    });
    const iz = trackBoutiqueOutboundClick({ boutiqueId: item.boutiqueId, boutiqueName: item.boutiqueName,
      sourceScreen: 'notification', destinationUrl: item.sourceUrl });
    router.push(webviewRoute({ boutiqueId: item.boutiqueId, url: item.sourceUrl, name: item.productTitle || item.boutiqueName, iz }));
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('notifications.back')}
          hitSlop={12} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.ink} />
        </Pressable>
        <Text style={styles.heading}>{t('notifications.title')}</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={() => { void query.refetch(); }}
        ListHeaderComponent={<Text style={styles.description}>{t('notifications.description')}</Text>}
        ListEmptyComponent={query.isPending ? <ActivityIndicator color={theme.colors.ink} /> :
          !query.isError ? <Text style={styles.description}>{t('notifications.empty')}</Text> : null}
        ListFooterComponent={
          <View>
            {query.isError && <View style={styles.footer}>
              <Text style={styles.description}>{t('notifications.error')}</Text>
              <Pressable accessibilityRole="button" onPress={() => {
                void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch());
              }}><Text style={styles.link}>{t('notifications.retry')}</Text></Pressable>
            </View>}
            {query.isFetchingNextPage ? <ActivityIndicator /> : query.hasNextPage && !query.isError ?
              <Pressable style={styles.footer} accessibilityRole="button" onPress={() => { void query.fetchNextPage(); }}>
                <Text style={styles.link}>{t('notifications.more')}</Text>
              </Pressable> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => open(item)}
            style={({ pressed }) => [styles.card, !item.readAt && styles.unread, pressed && { opacity: 0.65 }]}>
            <View style={styles.topline}>
              <Text style={styles.store}>{item.boutiqueName}</Text>
              {!item.readAt && <Text style={styles.badge}>{t('notifications.unread')}</Text>}
            </View>
            <Text style={styles.title}>{item.productTitle || t('notifications.product')}</Text>
            {item.type === 'back_in_stock' && <Text style={styles.kind}>{t('notifications.backInStock')}</Text>}
            <View style={styles.prices}>
              {item.previousPriceMinor !== null && item.previousPriceMinor > item.newPriceMinor &&
                <Text style={styles.oldPrice}>{price(item.previousPriceMinor, item.currency)}</Text>}
              <Text style={styles.newPrice}>{price(item.newPriceMinor, item.currency)}</Text>
            </View>
            <Text style={styles.date}>{new Date(item.createdAt).toLocaleString(i18n.language)}</Text>
            <Text style={styles.date}>{t('notifications.priceNote')}</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 18 },
  heading: { ...theme.type.h1, color: theme.colors.ink },
  list: { paddingBottom: 36 },
  description: { ...theme.type.caption, color: theme.colors.inkMute, marginBottom: 24 },
  card: { paddingVertical: 20, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: theme.colors.mist, gap: 10 },
  unread: { borderLeftWidth: 3, borderLeftColor: theme.colors.gold },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  store: { ...theme.type.micro, color: theme.colors.inkMute, flex: 1 },
  badge: { ...theme.type.micro, color: theme.colors.clay },
  title: { ...theme.type.h3, color: theme.colors.ink },
  kind: { ...theme.type.micro, color: theme.colors.sage },
  prices: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  oldPrice: { ...theme.type.body, color: theme.colors.inkMute, textDecorationLine: 'line-through' },
  newPrice: { ...theme.type.body, fontFamily: theme.font.bodySemibold, color: theme.colors.ink },
  date: { ...theme.type.caption, color: theme.colors.inkMute },
  footer: { paddingVertical: 24, alignItems: 'center' },
  link: { ...theme.type.body, color: theme.colors.ink, textDecorationLine: 'underline' },
});
