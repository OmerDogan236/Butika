import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { PostHogMaskView } from 'posthog-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type Boutique, type SavedProduct, useSearch } from '../src/api/queries';
import { useAramaKaydi, useAramaOlcumu } from '../src/hooks/useAramaOlcumu';
import { useDebounce } from '../src/hooks/useDebounce';
import { useGosterimOlcumu } from '../src/hooks/useGosterimOlcumu';
import { trackBoutiqueOutboundClick, trackSearchResultClick } from '../src/lib/analytics';
import {
  type AramaKaydi,
  gecmisAnahtari,
  gecmiseEkle,
  gecmisiOku,
  gecmistenSil,
} from '../src/lib/arama-gecmisi';
import { butikYolu } from '../src/lib/butik-kaynagi';
import { buyukHarf } from '../src/lib/buyuk-harf';
import { webviewRoute } from '../src/lib/route-text';
import { useAuthStore } from '../src/stores/auth';
import { theme } from '../src/theme';

/** "Geçmiş aramaların": bu cihazda, kullanıcı başına saklanır. */
function useAramaGecmisi() {
  const userId = useAuthStore((s) => s.user?.id);
  const anahtar = gecmisAnahtari(userId);
  const [gecmis, setGecmis] = useState<AramaKaydi[]>([]);

  useEffect(() => {
    let iptal = false;
    AsyncStorage.getItem(anahtar)
      .then((ham) => {
        if (!iptal) setGecmis(gecmisiOku(ham));
      })
      .catch(() => {});
    return () => {
      iptal = true;
    };
  }, [anahtar]);

  const degistir = useCallback(
    (yeni: (eski: AramaKaydi[]) => AramaKaydi[]) => {
      setGecmis((eski) => {
        const sonraki = yeni(eski);
        AsyncStorage.setItem(anahtar, JSON.stringify(sonraki)).catch(() => {});
        return sonraki;
      });
    },
    [anahtar],
  );

  return {
    gecmis,
    ekle: (kayit: AramaKaydi) => degistir((eski) => gecmiseEkle(eski, kayit)),
    sil: (kayit: AramaKaydi) => degistir((eski) => gecmistenSil(eski, kayit)),
    temizle: () => degistir(() => []),
  };
}

export default function SearchScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 250);
  const { data, isFetching } = useSearch(debouncedQuery);
  const arama = useAramaGecmisi();

  const showResults = debouncedQuery.trim().length > 0;
  const totalResults = (data?.boutiques.length ?? 0) + (data?.savedProducts.length ?? 0);
  const showEmptyMessage = showResults && !isFetching && totalResults === 0;

  // Sonuçlar yazarken canlı gelir; arama, yazma bitince (ya da Ara'ya basınca) bir kez sayılır.
  const olcer = useAramaOlcumu('boutique_and_saved');
  // Butik kartlarının gösterimi arama sayılınca (search_id belli olunca) gönderilir.
  const aramaKaydi = useAramaKaydi(olcer);
  const aramaMetni = debouncedQuery.trim();
  const gosterim = useGosterimOlcumu(
    'arama',
    `canli:${aramaMetni}`,
    aramaKaydi && aramaKaydi.query === aramaMetni
      ? { search_id: aramaKaydi.searchId, search_mode: 'canli' }
      : null,
  );
  useEffect(() => {
    if (query.trim() !== debouncedQuery.trim() || !showResults) {
      olcer.vazgec();
      return;
    }
    if (!isFetching && data) olcer.sonuclarGeldi(debouncedQuery, totalResults);
  }, [olcer, query, debouncedQuery, showResults, isFetching, data, totalResults]);

  // sira: arama sonuçlarından açıldıysa 1-tabanlı yeri; geçmişten açılınca verilmez (arama sayılmaz).
  function openBoutique(
    b: { id: string; name: string; coverImageUrl: string | null },
    sira?: number,
  ) {
    if (sira !== undefined) {
      trackSearchResultClick({
        searchId: olcer.gonder()?.searchId ?? null,
        position: sira,
        resultType: 'boutique',
        boutiqueId: b.id,
      });
    }
    arama.ekle({
      tur: 'butik',
      id: b.id,
      ad: b.name,
      kapak: b.coverImageUrl ?? null,
      tarih: new Date().toISOString(),
    });
    router.back();
    setTimeout(() => router.push(butikYolu(b.id, 'arama', undefined, sira)), 50);
  }

  function aramayiKaydet() {
    if (debouncedQuery.trim()) {
      arama.ekle({ tur: 'metin', metin: debouncedQuery, tarih: new Date().toISOString() });
    }
  }

  function openSavedProduct(p: SavedProduct, listIndex?: number) {
    trackSearchResultClick({
      searchId: olcer.gonder()?.searchId ?? null,
      position: listIndex ?? null,
      resultType: 'saved_product',
      boutiqueId: p.boutiqueId,
      productId: p.id,
    });
    aramayiKaydet();
    const iz = trackBoutiqueOutboundClick({
      boutiqueId: p.boutiqueId,
      boutiqueName: p.boutique.name,
      sourceScreen: 'search',
      destinationUrl: p.url,
      listPosition: listIndex ?? null,
    });
    router.back();
    setTimeout(() => {
      router.push(
        webviewRoute({
          iz,
          boutiqueId: p.boutiqueId,
          url: p.url,
          name: p.boutique.name,
          cover: p.imageUrl,
        }),
      );
    }, 50);
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <PostHogMaskView style={styles.inputWrap}>
            <Ionicons name="search" size={18} color={theme.colors.inkMute} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('search.placeholder')}
              placeholderTextColor={theme.colors.inkFaint}
              style={styles.input}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => {
                olcer.gonder();
                if (totalResults > 0) aramayiKaydet();
              }}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={theme.colors.inkFaint} />
              </Pressable>
            )}
          </PostHogMaskView>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.cancel}>{buyukHarf(t('search.cancel'), i18n.language)}</Text>
          </Pressable>
        </View>

        <View style={styles.divider} />

        {!showResults ? (
          arama.gecmis.length > 0 ? (
            <ScrollView
              contentContainerStyle={styles.results}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <PostHogMaskView style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{t('search.history')}</Text>
                  <Pressable onPress={arama.temizle} hitSlop={8}>
                    <Text style={styles.historyClear}>
                      {buyukHarf(t('search.historyClear'), i18n.language)}
                    </Text>
                  </Pressable>
                </View>
                {arama.gecmis.map((kayit) => (
                  <Pressable
                    key={kayit.tur === 'butik' ? `b-${kayit.id}` : `m-${kayit.metin}`}
                    style={({ pressed }) => [styles.historyRow, pressed && { opacity: 0.7 }]}
                    onPress={() =>
                      kayit.tur === 'butik'
                        ? openBoutique({ id: kayit.id, name: kayit.ad, coverImageUrl: kayit.kapak })
                        : setQuery(kayit.metin)
                    }
                  >
                    {kayit.tur === 'butik' ? (
                      <View style={styles.historyThumb}>
                        {kayit.kapak ? (
                          <Image
                            source={kayit.kapak}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                          />
                        ) : null}
                      </View>
                    ) : (
                      <View style={[styles.historyThumb, styles.historyIcon]}>
                        <Ionicons name="search" size={16} color={theme.colors.inkMute} />
                      </View>
                    )}
                    <Text style={styles.historyText} numberOfLines={1}>
                      {kayit.tur === 'butik' ? kayit.ad : kayit.metin}
                    </Text>
                    <Pressable
                      onPress={() => arama.sil(kayit)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t('search.historyRemove')}
                    >
                      <Ionicons name="close" size={18} color={theme.colors.inkFaint} />
                    </Pressable>
                  </Pressable>
                ))}
              </PostHogMaskView>
            </ScrollView>
          ) : (
            <EditorialIdle />
          )
        ) : showEmptyMessage ? (
          <EmptyResults query={debouncedQuery} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.results}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {isFetching && (
              <View style={styles.fetchingHint}>
                <ActivityIndicator size="small" color={theme.colors.gold} />
              </View>
            )}

            {data && data.boutiques.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title={t('search.boutiques')} count={data.boutiques.length} />
                <FlatList
                  data={data.boutiques}
                  keyExtractor={(b) => b.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hList}
                  onViewableItemsChanged={gosterim.onViewableItemsChanged}
                  viewabilityConfig={gosterim.viewabilityConfig}
                  renderItem={({ item, index }) => (
                    <Pressable
                      style={({ pressed }) => [styles.boutiqueCard, pressed && { opacity: 0.7 }]}
                      onPress={() => openBoutique(item, index + 1)}
                    >
                      <View style={styles.boutiqueCover}>
                        <Image
                          source={item.coverImageUrl}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                          transition={300}
                        />
                      </View>
                      <Text style={styles.boutiqueName} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </Pressable>
                  )}
                />
              </View>
            )}

            {data && data.savedProducts.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title={t('search.saved')} count={data.savedProducts.length} />
                {data.savedProducts.map((item, index) => (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [styles.savedRow, pressed && { opacity: 0.7 }]}
                    onPress={() => openSavedProduct(item, index + 1)}
                  >
                    <View style={styles.savedThumb}>
                      {item.imageUrl ? (
                        <Image
                          source={item.imageUrl}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                          transition={300}
                        />
                      ) : (
                        <View style={[StyleSheet.absoluteFill, styles.savedThumbFallback]}>
                          <Ionicons name="image-outline" size={20} color={theme.colors.mist} />
                        </View>
                      )}
                    </View>
                    <View style={styles.savedText}>
                      <Text style={styles.savedTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.savedSub} numberOfLines={1}>
                        {item.boutique.name}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.inkFaint} />
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EditorialIdle() {
  const { t, i18n } = useTranslation();
  return (
    <View style={styles.idleWrap}>
      <View style={styles.idleRule} />
      <Text style={styles.idleText}>{t('search.idle')}</Text>
      <View style={styles.idleRule} />
    </View>
  );
}

function EmptyResults({ query }: { query: string }) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  return (
    <View style={styles.idleWrap}>
      <Text style={styles.idleText}>
        <Text style={styles.idleQuery}>"{query}"</Text>
        {t('search.emptySuffix')}
      </Text>
      <Pressable
        onPress={() => router.push({ pathname: '/suggest', params: { name: query } })}
        style={({ pressed }) => [styles.suggestCta, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.suggestCtaText}>
          {buyukHarf(t('search.suggestCta'), i18n.language)}
        </Text>
      </Pressable>
    </View>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCount}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 44,
    backgroundColor: theme.colors.creamSoft,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: theme.colors.ink,
    paddingVertical: 0,
  },
  cancel: {
    ...theme.type.micro,
    color: theme.colors.ink,
    letterSpacing: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.mist,
  },
  results: { paddingBottom: 60 },
  fetchingHint: { alignItems: 'center', paddingVertical: 12 },
  section: { paddingTop: 24 },
  sectionHeader: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 24,
    color: theme.colors.ink,
  },
  sectionCount: {
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 2,
  },
  hList: {
    paddingHorizontal: 24,
    gap: 14,
  },
  boutiqueCard: {
    width: 140,
    gap: 8,
  },
  boutiqueCover: {
    width: 140,
    height: 175,
    backgroundColor: theme.colors.mist,
    borderRadius: 4,
    overflow: 'hidden',
  },
  boutiqueName: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 16,
    color: theme.colors.ink,
  },
  savedRow: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  savedThumb: {
    width: 56,
    height: 70,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: theme.colors.mist,
  },
  savedThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.creamSoft,
  },
  savedText: { flex: 1, gap: 4 },
  savedTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: theme.colors.ink,
    lineHeight: 20,
  },
  savedSub: {
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 1,
  },
  historyClear: {
    ...theme.type.micro,
    color: theme.colors.bordo,
    letterSpacing: 1.2,
  },
  historyRow: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  historyThumb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: theme.colors.mist,
  },
  historyIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.creamSoft,
  },
  historyText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: theme.colors.ink,
  },
  idleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 48,
  },
  idleRule: {
    width: 48,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.gold,
  },
  idleText: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 22,
    lineHeight: 30,
    color: theme.colors.inkMute,
    textAlign: 'center',
  },
  idleQuery: { color: theme.colors.ink },
  suggestCta: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: theme.colors.gold,
  },
  suggestCtaText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 2.5,
    color: theme.colors.gold,
  },
});
