import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type SavedProduct,
  trackEvents,
  useCollection,
  useCollectionProducts,
  useDeleteCollection,
  useRemoveFromCollection,
} from '../../src/api/queries';
import { trackBoutiqueOutboundClick } from '../../src/lib/analytics';
import { buyukHarf } from '../../src/lib/buyuk-harf';
import { webviewRoute } from '../../src/lib/route-text';
import { theme } from '../../src/theme';

const COLUMN_GAP = 12;
const SCREEN_PADDING = 20;

export default function CollectionDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id ?? '';

  const { data: collection, isLoading: metaLoading } = useCollection(id);
  const { data, isLoading, refetch, isRefetching } = useCollectionProducts(id);
  const deleteCollection = useDeleteCollection();
  const removeFromCollection = useRemoveFromCollection();

  function openProduct(item: SavedProduct, listIndex?: number) {
    trackEvents([{ type: 'product_open', payload: { id: item.id, url: item.url } }]);
    const iz = trackBoutiqueOutboundClick({
      boutiqueId: item.boutiqueId,
      boutiqueName: item.boutique.name,
      sourceScreen: 'collection',
      destinationUrl: item.url,
      listPosition: listIndex ?? null,
    });
    router.push(
      webviewRoute({
        iz,
        boutiqueId: item.boutiqueId,
        url: item.url,
        name: item.boutique.name,
        cover: item.imageUrl,
      }),
    );
  }

  function confirmRemove(item: SavedProduct) {
    Alert.alert(t('collections.removeTitle'), t('collections.removeBody', { title: item.title }), [
      { text: t('collections.removeCancel'), style: 'cancel' },
      {
        text: t('collections.removeConfirm'),
        style: 'destructive',
        onPress: () =>
          removeFromCollection.mutate({
            savedId: item.id,
            collectionId: id,
          }),
      },
    ]);
  }

  function confirmDelete() {
    Alert.alert(
      t('collections.deleteTitle'),
      t('collections.deleteBody', { name: collection?.name ?? '' }),
      [
        { text: t('collections.deleteCancel'), style: 'cancel' },
        {
          text: t('collections.deleteConfirm'),
          style: 'destructive',
          onPress: () => {
            deleteCollection.mutate(id, {
              onSuccess: () => router.back(),
            });
          },
        },
      ],
    );
  }

  function openMenu() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            t('collections.menuCancel'),
            t('collections.menuEdit'),
            t('collections.menuDelete'),
          ],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
          title: collection?.name,
        },
        (i) => {
          if (i === 1) router.push(`/collection/${id}/edit`);
          else if (i === 2) confirmDelete();
        },
      );
    } else {
      Alert.alert(collection?.name ?? '', undefined, [
        { text: t('collections.menuEdit'), onPress: () => router.push(`/collection/${id}/edit`) },
        { text: t('collections.menuDelete'), style: 'destructive', onPress: confirmDelete },
        { text: t('collections.menuCancel'), style: 'cancel' },
      ]);
    }
  }

  const items = data?.items ?? [];
  const productCount = items.length;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.ink} />
        </Pressable>
        <Pressable onPress={openMenu} hitSlop={12}>
          <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.ink} />
        </Pressable>
      </View>

      {metaLoading ? (
        <ActivityIndicator color={theme.colors.gold} style={styles.metaLoading} />
      ) : (
        <View style={styles.header}>
          <Text style={styles.kicker}>{buyukHarf(t('collections.kicker'), i18n.language)}</Text>
          <Text style={styles.brand}>{collection?.name}</Text>
          {collection?.description ? (
            <Text style={styles.desc}>{collection.description}</Text>
          ) : null}
          {productCount > 0 ? (
            <Text style={styles.summary}>
              {buyukHarf(t('collections.productCount', { count: productCount }), i18n.language)}
            </Text>
          ) : null}
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: COLUMN_GAP }}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.colors.gold}
          />
        }
        renderItem={({ item, index }) => (
          <View style={styles.cardWrap}>
            <Pressable
              onPress={() => openProduct(item, index + 1)}
              onLongPress={() => confirmRemove(item)}
              delayLongPress={350}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.thumb}>
                {item.imageUrl ? (
                  <Image
                    source={item.imageUrl}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.thumbEmpty]}>
                    <Ionicons name="image-outline" size={20} color={theme.colors.mist} />
                  </View>
                )}
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.cardSub} numberOfLines={1}>
                {item.boutique.name}
              </Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyRule} />
              <Text style={styles.emptyText}>{t('collections.detailEmpty')}</Text>
              <View style={styles.emptyRule} />
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  metaLoading: { paddingVertical: 40 },
  header: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 8,
    paddingBottom: 24,
  },
  kicker: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 3,
  },
  brand: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 44,
    lineHeight: 48,
    color: theme.colors.ink,
    marginTop: 4,
    letterSpacing: -0.5,
  },
  desc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.inkMute,
    marginTop: 12,
    maxWidth: 320,
  },
  summary: {
    ...theme.type.micro,
    color: theme.colors.gold,
    letterSpacing: 2.5,
    marginTop: 16,
  },
  list: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 8,
    paddingBottom: 60,
  },
  cardWrap: { flex: 1 },
  card: { gap: 8 },
  thumb: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: theme.colors.mist,
    borderRadius: 4,
    overflow: 'hidden',
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.creamSoft,
  },
  cardTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: theme.colors.ink,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  cardSub: {
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 1.5,
    paddingHorizontal: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
    paddingTop: 80,
    gap: 24,
  },
  emptyRule: {
    width: 48,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.gold,
  },
  emptyText: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 18,
    lineHeight: 26,
    color: theme.colors.inkMute,
    textAlign: 'center',
  },
});
