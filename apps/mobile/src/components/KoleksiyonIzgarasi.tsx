import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { type ReactElement, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { type Collection, useCollections } from '../api/queries';
import { buyukHarf } from '../lib/buyuk-harf';
import { useTurStore } from '../stores/tur';
import { theme } from '../theme';
import { TurHedefi } from './tur/TurHedefi';

const COLUMN_GAP = 16;
const SCREEN_PADDING = 24;

/**
 * Koleksiyonlar ızgarası. 1.2.4'ten beri ayrı sekme değil; Profil'deki
 * "Koleksiyonlar" bölümünde görünür (eski /collections ekranı da bunu kullanır).
 */
export function KoleksiyonIzgarasi({ ustBilesen }: { ustBilesen?: ReactElement | null }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useCollections();

  function openCollection(c: Collection) {
    router.push(`/collection/${c.id}`);
  }

  function openNew() {
    router.push('/collection/new');
  }

  // Izgara yalnız bölüm açıkken monte olur; tur da o an başlar.
  const turuBaslat = useTurStore((s) => s.turuBaslat);
  const turGorulenler = useTurStore((s) => s.gorulenler);
  useEffect(() => {
    if (turGorulenler === null) return;
    const zamanlayici = setTimeout(() => turuBaslat('koleksiyon'), 400);
    return () => clearTimeout(zamanlayici);
  }, [turGorulenler, turuBaslat]);

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(c) => c.id}
      numColumns={2}
      columnWrapperStyle={{ gap: COLUMN_GAP }}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: 28 }} />}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={theme.colors.gold}
        />
      }
      ListHeaderComponent={
        <>
          {ustBilesen}
          {data?.length ? (
            <TurHedefi hedefId="koleksiyon.yeni" style={styles.newWrap}>
              <Pressable
                onPress={openNew}
                hitSlop={8}
                accessibilityRole="button"
                style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="add" size={18} color={theme.colors.gold} />
                <Text style={styles.newText}>
                  {buyukHarf(t('collections.newCta'), i18n.language)}
                </Text>
              </Pressable>
            </TurHedefi>
          ) : null}
        </>
      }
      renderItem={({ item }) => (
        <View style={styles.cardWrap}>
          <CollectionCard collection={item} onPress={() => openCollection(item)} />
        </View>
      )}
      ListEmptyComponent={
        isLoading ? null : (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyRule} />
            <Text style={styles.emptyText}>{t('collections.empty')}</Text>
            <TurHedefi hedefId="koleksiyon.yeni">
              <Pressable
                onPress={openNew}
                style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.emptyCtaText}>
                  {buyukHarf(t('collections.newCta'), i18n.language)}
                </Text>
              </Pressable>
            </TurHedefi>
            <View style={styles.emptyRule} />
          </View>
        )
      }
    />
  );
}

function CollectionCard({
  collection,
  onPress,
}: {
  collection: Collection;
  onPress: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.cover}>
        {collection.coverUrls.length === 0 ? (
          <View style={[StyleSheet.absoluteFill, styles.coverEmpty]}>
            <Ionicons name="albums-outline" size={28} color={theme.colors.mist} />
          </View>
        ) : (
          <CoverMosaic urls={collection.coverUrls} />
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {collection.name}
      </Text>
      <Text style={styles.cardSub}>
        {t('collections.productCount', { count: collection.productCount })}
      </Text>
    </Pressable>
  );
}

function CoverMosaic({ urls }: { urls: string[] }) {
  if (urls.length === 1) {
    return (
      <Image source={urls[0]} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
    );
  }
  if (urls.length === 2) {
    return (
      <View style={styles.mosaicRow}>
        <View style={styles.mosaicHalf}>
          <Image
            source={urls[0]}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
        </View>
        <View style={[styles.mosaicHalf, styles.mosaicHalfRight]}>
          <Image
            source={urls[1]}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
        </View>
      </View>
    );
  }
  // 3 ya da 4
  return (
    <View style={styles.mosaicGrid}>
      <View style={styles.mosaicTL}>
        <Image
          source={urls[0]}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
      </View>
      <View style={styles.mosaicTR}>
        <Image
          source={urls[1]}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
      </View>
      <View style={styles.mosaicBL}>
        <Image
          source={urls[2]}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
        />
      </View>
      <View style={styles.mosaicBR}>
        {urls[3] ? (
          <Image
            source={urls[3]}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.mosaicEmpty]} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  newWrap: { alignSelf: 'flex-start', marginBottom: 20 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.colors.gold,
  },
  newText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 2.5,
    color: theme.colors.gold,
  },
  list: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 4,
    paddingBottom: 120,
  },
  cardWrap: { flex: 1 },
  card: {
    gap: 10,
  },
  cover: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: theme.colors.mist,
    borderRadius: 4,
    overflow: 'hidden',
  },
  coverEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.creamSoft,
  },
  mosaicRow: { flex: 1, flexDirection: 'row' },
  mosaicHalf: { flex: 1 },
  mosaicHalfRight: { borderLeftWidth: 1, borderLeftColor: theme.colors.cream },
  mosaicGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  mosaicTL: { width: '50%', height: '50%' },
  mosaicTR: {
    width: '50%',
    height: '50%',
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.cream,
  },
  mosaicBL: { width: '50%', height: '50%', borderTopWidth: 1, borderTopColor: theme.colors.cream },
  mosaicBR: {
    width: '50%',
    height: '50%',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: theme.colors.cream,
  },
  mosaicEmpty: { backgroundColor: theme.colors.creamSoft },
  cardTitle: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 20,
    color: theme.colors.ink,
    lineHeight: 24,
    paddingHorizontal: 2,
  },
  cardSub: {
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 2,
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
    fontSize: 22,
    lineHeight: 30,
    color: theme.colors.inkMute,
    textAlign: 'center',
  },
  emptyCta: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: theme.colors.gold,
  },
  emptyCtaText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 2.5,
    color: theme.colors.gold,
  },
});
