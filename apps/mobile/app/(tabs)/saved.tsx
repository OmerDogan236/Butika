import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { PostHogMaskView } from 'posthog-react-native';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dimensions,
  Pressable,
  RefreshControl,
  SectionList,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotifications, useReadNotification } from '../../src/api/notifications';
import {
  type SavedProduct,
  trackEvents,
  useKayitliButikler,
  useSavedProducts,
  useSiparisler,
  useUnsaveById,
} from '../../src/api/queries';
import { BildirimlerKutusu } from '../../src/components/BildirimlerKutusu';
import { ButikSiparisKarti } from '../../src/components/ButikSiparisKarti';
import { ButiklerimListesi, ButiklerimSeridi } from '../../src/components/ButiklerimSeridi';
import { CollectionPicker } from '../../src/components/CollectionPicker';
import { KoleksiyonIzgarasi } from '../../src/components/KoleksiyonIzgarasi';
import { PurchaseCard } from '../../src/components/PurchaseCard';
import { PurchaseSheet } from '../../src/components/PurchaseSheet';
import { RestockToggle, useRestockToggle } from '../../src/components/RestockToggle';
import { SavedSectionSkeleton } from '../../src/components/SavedRowSkeleton';
import { Toast, type ToastTone } from '../../src/components/Toast';
import { useDebounce } from '../../src/hooks/useDebounce';
import { addedLabel } from '../../src/lib/addedLabel';
import { trackBoutiqueOutboundClick } from '../../src/lib/analytics';
import { buyukHarf } from '../../src/lib/buyuk-harf';
import { type KayitHaberi, haberSirasi, kayitHaberleri } from '../../src/lib/kayit-haberi';
import { includesQuery } from '../../src/lib/normalize';
import { webviewRoute } from '../../src/lib/route-text';
import { useTurStore } from '../../src/stores/tur';
import { theme } from '../../src/theme';

type SortMode = 'recent' | 'boutique';

/** Profil'in bölümleri: Ürünler · Butiklerim · Koleksiyonlar (+ Satın aldıklarım). */
// Başlık büyük harfle; marka adı Keşfet'teki gibi noktasız "BUTIKA" kalır.
function markaBasligi(metin: string, dil: string): string {
  return buyukHarf(metin, dil).replace(/BUTİKA/g, 'BUTIKA');
}

type Gorunum = 'saved' | 'boutiques' | 'collections' | 'purchased';

function sekmedenGorunum(sekme: string | undefined): Gorunum | null {
  if (sekme === 'satin') return 'purchased';
  if (sekme === 'butiklerim') return 'boutiques';
  if (sekme === 'koleksiyonlar') return 'collections';
  return null;
}

interface BoutiqueSection {
  title: string;
  boutiqueId: string;
  data: SavedProduct[];
}

interface PurchaseSection {
  key: string;
  title: string;
  data: SavedProduct[];
}

const DELETE_WIDTH = 88;
const BUY_WIDTH = 120;

export default function SavedScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useSavedProducts();
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  // Bağlı butiklerden otomatik okunan siparişler: yalnız pilot kullanıcıda ve varsa görünür;
  // diğer herkeste Satın Aldıklarım bugünkü haliyle kalır.
  const { data: siparisYaniti, refetch: refetchSiparis } = useSiparisler();
  const otoSiparisler = siparisYaniti?.pilot ? siparisYaniti.siparisler : [];
  const unsave = useUnsaveById();
  const restock = useRestockToggle(showToast, 'saved');

  // Fiyatı düşen ve stoğa gelen kayıtlar bu ekranda da görünür (29 Eyl testi).
  const bildirimler = useNotifications();
  const { refetch: refetchBildirim } = bildirimler;
  useFocusEffect(
    useCallback(() => {
      void refetchBildirim();
    }, [refetchBildirim]),
  );
  const okundu = useReadNotification();
  const haberler = useMemo(
    () => kayitHaberleri(bildirimler.data?.pages.flatMap((page) => page.items) ?? []),
    [bildirimler.data],
  );
  const haberliKayitlar = useMemo(
    () =>
      (data ?? [])
        .flatMap((item) => {
          const haber = haberler.get(item.url);
          return haber ? [{ item, haber }] : [];
        })
        .sort((a, b) => haberSirasi(a.haber, b.haber))
        .slice(0, 3),
    [data, haberler],
  );
  const refresh = useCallback(() => {
    void refetch();
    void refetchBildirim();
    void refetchSiparis();
  }, [refetch, refetchBildirim, refetchSiparis]);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 250);
  const [sort, setSort] = useState<SortMode>('recent');
  // Ayarlar → "Satın Aldıklarım" bu ekrana ?sekme=satin ile, butik sayfasındaki
  // "Butiklerim'e eklendi · Gör" ?sekme=butiklerim ile gelir.
  const { sekme } = useLocalSearchParams<{ sekme?: string }>();
  const [view, setView] = useState<Gorunum>(sekmedenGorunum(sekme) ?? 'saved');
  // Sekme zaten açıkken gelinirse (Ayarlar modalı kapanınca) de istenen bölüme geç.
  useEffect(() => {
    const istenen = sekmedenGorunum(sekme);
    if (istenen) setView(istenen);
  }, [sekme]);
  const butikSayisi = useKayitliButikler().data?.length ?? 0;
  const [purchaseTarget, setPurchaseTarget] = useState<SavedProduct | null>(null);

  const sections = useMemo<BoutiqueSection[]>(() => {
    if (!data) return [];
    const filtered = debouncedQuery
      ? data.filter((it) => includesQuery(`${it.title} ${it.boutique.name}`, debouncedQuery))
      : data;

    if (sort === 'recent') {
      if (filtered.length === 0) return [];
      const sorted = [...filtered].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return [{ title: '', boutiqueId: '__recent__', data: sorted }];
    }

    // Butiğe göre grupla (ilk görülme sırasını koru)
    const map = new Map<string, BoutiqueSection>();
    for (const item of filtered) {
      const key = item.boutiqueId;
      const existing = map.get(key);
      if (existing) {
        existing.data.push(item);
      } else {
        map.set(key, {
          title: item.boutique.name,
          boutiqueId: item.boutiqueId,
          data: [item],
        });
      }
    }
    return Array.from(map.values());
  }, [data, debouncedQuery, sort]);

  const totalCount = data?.length ?? 0;

  const purchasedCount = useMemo(() => (data ?? []).filter((p) => p.purchasedAt).length, [data]);
  const purchasedSections = useMemo<PurchaseSection[]>(() => {
    const purchased = (data ?? []).filter((p) => p.purchasedAt);
    const inTransit = purchased.filter((p) => !p.deliveredAt);
    const done = purchased.filter((p) => p.deliveredAt);
    const out: PurchaseSection[] = [];
    if (inTransit.length)
      out.push({ key: 'transit', title: t('purchases.inTransit'), data: inTransit });
    if (done.length) out.push({ key: 'delivered', title: t('purchases.delivered'), data: done });
    return out;
  }, [data, t]);

  const [toast, setToast] = useState<{ visible: boolean; message: string; tone: ToastTone }>({
    visible: false,
    message: '',
    tone: 'success',
  });
  const [pickerSavedId, setPickerSavedId] = useState<string | null>(null);

  const turuBaslat = useTurStore((s) => s.turuBaslat);
  const turGorulenler = useTurStore((s) => s.gorulenler);
  // Tur YALNIZ ekran odaktayken baslar (bkz. index.tsx'teki ayni aciklama).
  // Hedef ("kayitli.alan") artik alt sekme cubugunda — yani her zaman monte —
  // oldugu icin turu ekrana bagli tutan tek sey bu efekt: `useFocusEffect`
  // sayesinde tur yalnizca Kayitli sekmesi acikken acilir.
  // `isLoading` korumasi kaliyor: yukleniyorken ekran iskelet gosteriyor,
  // kullanici daha ne kaydettigini gormeden ipucu acilmasin.
  useFocusEffect(
    useCallback(() => {
      if (isLoading) return;
      if (turGorulenler === null) return;
      const zamanlayici = setTimeout(() => turuBaslat('kayitli'), 400);
      return () => clearTimeout(zamanlayici);
    }, [isLoading, turGorulenler, turuBaslat]),
  );

  // Uyarı kendiliğinden kapanmaz (bkz. Toast); sekmeden çıkınca kapanır.
  function showToast(message: string, tone: ToastTone = 'success') {
    setToast({ visible: true, message, tone });
  }
  const closeToast = useCallback(() => setToast((t) => ({ ...t, visible: false })), []);
  useFocusEffect(useCallback(() => closeToast, [closeToast]));

  function openProduct(item: SavedProduct, listIndex?: number) {
    const haber = haberler.get(item.url);
    if (haber?.okunmadi) okundu.mutate(haber.bildirimId);
    trackEvents([{ type: 'product_open', payload: { id: item.id, url: item.url } }]);
    const iz = trackBoutiqueOutboundClick({
      boutiqueId: item.boutiqueId,
      boutiqueName: item.boutique.name,
      sourceScreen: 'saved',
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

  async function shareProduct(item: SavedProduct) {
    try {
      const result = await Share.share({
        message: `${item.title}\n${item.url}`,
        url: item.url,
        title: item.title,
      });
      trackEvents([{ type: 'share', payload: { id: item.id } }]);
      if (result.action === Share.sharedAction) {
        showToast(t('saved.shared'));
      }
    } catch {
      // Kullanıcı iptal etti, sessiz geç.
    }
  }

  function handleSwipeDelete(item: SavedProduct) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    unsave.mutate(item.id);
  }

  function goToBoutiques() {
    router.push('/(tabs)');
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.brand}>{markaBasligi(t('saved.brand'), i18n.language)}</Text>
        </View>
        <SavedSectionSkeleton />
        <SavedSectionSkeleton />
      </SafeAreaView>
    );
  }

  const satinSayisi = purchasedCount + otoSiparisler.length;
  const bolumler: { id: Gorunum; etiket: string }[] = [
    { id: 'saved', etiket: t('saved.segProducts') },
    { id: 'boutiques', etiket: t('saved.segBoutiques') },
    { id: 'collections', etiket: t('saved.segCollections') },
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.push('/profile/settings')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('profile.settingsA11y')}
          style={({ pressed }) => [styles.ayarlar, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="settings-outline" size={22} color={theme.colors.bordo} />
        </Pressable>
        <Text style={styles.brand}>{markaBasligi(t('saved.brand'), i18n.language)}</Text>
        <View style={styles.summaryRow}>
          {totalCount + butikSayisi > 0 ? (
            <Text style={styles.summary}>
              {buyukHarf(
                t('saved.summary', { products: totalCount, boutiques: butikSayisi }),
                i18n.language,
              )}
            </Text>
          ) : (
            <View />
          )}
          <Pressable
            onPress={() => setView(view === 'purchased' ? 'saved' : 'purchased')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityState={{ selected: view === 'purchased' }}
          >
            <Text style={[styles.purchasedLink, view === 'purchased' && styles.purchasedLinkOn]}>
              {buyukHarf(
                `${t('saved.purchasedLink')}${satinSayisi ? ` · ${satinSayisi}` : ''}`,
                i18n.language,
              )}{' '}
              ›
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.seg} accessibilityRole="tablist">
        {bolumler.map((b) => {
          const secili = view === b.id;
          return (
            <Pressable
              key={b.id}
              style={[styles.segTab, secili && styles.segTabOn]}
              onPress={() => setView(b.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: secili }}
            >
              <Text
                style={[styles.segText, secili && styles.segTextOn]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {buyukHarf(b.etiket, i18n.language)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {view === 'boutiques' ? <ButiklerimListesi /> : null}
      {view === 'collections' ? <KoleksiyonIzgarasi /> : null}

      {view === 'purchased' ? (
        <SectionList
          sections={purchasedSections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refresh}
              tintColor={theme.colors.gold}
            />
          }
          stickySectionHeadersEnabled={false}
          SectionSeparatorComponent={() => <View style={{ height: 16 }} />}
          renderSectionHeader={({ section }) => (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <PurchaseCard
                product={item}
                onEdit={() => setPurchaseTarget(item)}
                onCopied={() => showToast(t('purchases.copied'))}
              />
            </View>
          )}
          ListHeaderComponent={
            otoSiparisler.length > 0 ? (
              <View style={styles.otoWrap}>
                <View style={[styles.section, styles.otoSection]}>
                  <Text style={[styles.sectionTitle, styles.otoTitle]}>
                    {t('purchases.otoBaslik')}
                  </Text>
                  <Text style={styles.sectionCount}>{otoSiparisler.length}</Text>
                </View>
                {otoSiparisler.map((siparis) => (
                  <View key={siparis.id} style={styles.cardWrap}>
                    <ButikSiparisKarti siparis={siparis} />
                  </View>
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={
            otoSiparisler.length > 0 ? null : (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyRule} />
                <Text style={styles.emptyText}>{t('purchases.empty')}</Text>
                <View style={styles.emptyRule} />
              </View>
            )
          }
        />
      ) : view === 'saved' ? (
        <>
          {totalCount > 0 ? (
            <View style={styles.controls}>
              <PostHogMaskView style={styles.inputWrap}>
                <Ionicons name="search" size={18} color={theme.colors.bordoAcik} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t('saved.searchPlaceholder')}
                  placeholderTextColor={theme.colors.inkFaint}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {query.length > 0 ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={theme.colors.inkFaint} />
                  </Pressable>
                ) : null}
              </PostHogMaskView>
              <View style={styles.sortRow}>
                <Pressable onPress={() => setSort('recent')} hitSlop={8}>
                  <Text style={[styles.sortLabel, sort === 'recent' && styles.sortActive]}>
                    {buyukHarf(t('saved.sortRecent'), i18n.language)}
                  </Text>
                </Pressable>
                <Text style={styles.sortDivider}>·</Text>
                <Pressable onPress={() => setSort('boutique')} hitSlop={8}>
                  <Text style={[styles.sortLabel, sort === 'boutique' && styles.sortActive]}>
                    {buyukHarf(t('saved.sortBoutique'), i18n.language)}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <BildirimlerKutusu />

          {debouncedQuery ? null : (
            <ButiklerimSeridi
              onTumu={() => setView('boutiques')}
              onEkle={() => router.push('/(tabs)')}
            />
          )}

          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.list, sort === 'recent' && styles.listRecent]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refresh}
                tintColor={theme.colors.gold}
              />
            }
            stickySectionHeadersEnabled={false}
            SectionSeparatorComponent={
              sort === 'recent' ? undefined : () => <View style={{ height: 24 }} />
            }
            ListHeaderComponent={
              !debouncedQuery && haberliKayitlar.length > 0 ? (
                <View style={styles.newsBox}>
                  <Text style={styles.newsTitle}>
                    {buyukHarf(t('saved.newsTitle'), i18n.language)}
                  </Text>
                  {haberliKayitlar.map(({ item, haber }) => (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [styles.newsRow, pressed && { opacity: 0.7 }]}
                      onPress={() => openProduct(item)}
                    >
                      <View style={styles.newsThumb}>
                        {item.imageUrl ? (
                          <Image
                            source={item.imageUrl}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                          />
                        ) : null}
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.newsRowTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <HaberEtiketi haber={haber} />
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={theme.colors.bordo} />
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => router.push('/notifications')}
                    hitSlop={8}
                    style={({ pressed }) => [styles.newsAll, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={styles.newsAllText}>
                      {buyukHarf(t('saved.newsAll'), i18n.language)}
                    </Text>
                  </Pressable>
                </View>
              ) : null
            }
            renderSectionHeader={({ section }) =>
              section.boutiqueId === '__recent__' ? null : (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text style={styles.sectionCount}>{section.data.length}</Text>
                </View>
              )
            }
            renderItem={({ item, index }) => (
              <SwipeableRow
                onDelete={() => handleSwipeDelete(item)}
                onBuy={() => setPurchaseTarget(item)}
              >
                <Pressable
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                  onPress={() => openProduct(item, index + 1)}
                >
                  <View style={styles.thumb}>
                    {item.imageUrl ? (
                      <Image
                        source={item.imageUrl}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={300}
                      />
                    ) : (
                      <PatternFallback />
                    )}
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <HaberEtiketi haber={haberler.get(item.url)} />
                    <Text style={styles.rowHost} numberOfLines={1}>
                      {sort === 'recent' ? item.boutique.name : hostname(item.url)} ·{' '}
                      {addedLabel(item.createdAt)}
                    </Text>
                    {item.tracking && (
                      <>
                        <Text
                          style={[
                            styles.rowHost,
                            {
                              color:
                                item.tracking.status === 'active'
                                  ? theme.colors.sage
                                  : theme.colors.inkMute,
                            },
                          ]}
                        >
                          {t(`saved.tracking_${item.tracking.status}`)}
                        </Text>
                        {item.tracking.priceMinor && item.tracking.currency ? (
                          <Text style={styles.rowHost}>
                            {t('saved.lastPrice', {
                              price: new Intl.NumberFormat(i18n.language, {
                                style: 'currency',
                                currency: item.tracking.currency,
                              }).format(item.tracking.priceMinor / 100),
                            })}
                          </Text>
                        ) : null}
                      </>
                    )}
                    <RestockToggle
                      item={item}
                      disabled={restock.pending}
                      onPress={() => restock.toggle(item)}
                    />
                    {item.purchasedAt ? (
                      <View style={styles.rowBadge}>
                        <Ionicons name="checkmark" size={11} color={theme.colors.sage} />
                        <Text style={styles.rowBadgeText}>
                          {buyukHarf(t('purchases.purchasedBadge'), i18n.language)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => setPickerSavedId(item.id)}
                    hitSlop={10}
                    style={({ pressed }) => [styles.rowAction, pressed && { opacity: 0.5 }]}
                  >
                    <Ionicons name="albums-outline" size={20} color={theme.colors.gold} />
                  </Pressable>
                  <Pressable
                    onPress={() => shareProduct(item)}
                    hitSlop={10}
                    style={({ pressed }) => [styles.rowAction, pressed && { opacity: 0.5 }]}
                  >
                    <Ionicons name="share-outline" size={20} color={theme.colors.gold} />
                  </Pressable>
                </Pressable>
              </SwipeableRow>
            )}
            ListEmptyComponent={
              debouncedQuery ? (
                <View style={styles.noResults}>
                  <View style={styles.emptyRule} />
                  <Text style={styles.emptyText}>
                    {t('saved.noResults', { query: query.trim() })}
                  </Text>
                  <View style={styles.emptyRule} />
                </View>
              ) : (
                <View style={styles.emptyWrap}>
                  <View style={styles.emptyRule} />
                  <Text style={[styles.emptyText, styles.emptyTitle]}>{t('saved.emptyTitle')}</Text>
                  <View style={styles.emptyLines}>
                    {[t('saved.emptyLine1'), t('saved.emptyLine2'), t('saved.emptyLine3')].map(
                      (satir) => (
                        <View key={satir} style={styles.emptyLine}>
                          <View style={styles.emptyDot} />
                          <Text style={styles.emptyLineText}>{satir}</Text>
                        </View>
                      ),
                    )}
                  </View>
                  <Pressable
                    onPress={goToBoutiques}
                    style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.emptyCtaText}>
                      {buyukHarf(t('saved.emptyCta'), i18n.language)}
                    </Text>
                  </Pressable>
                  <View style={styles.emptyRule} />
                </View>
              )
            }
          />
        </>
      ) : null}

      <Toast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        onClose={closeToast}
      />

      <CollectionPicker
        visible={!!pickerSavedId}
        savedId={pickerSavedId}
        onClose={() => setPickerSavedId(null)}
        onSuccess={(count) => showToast(t('saved.addedToCollections', { count }), 'success')}
      />

      <PurchaseSheet
        product={purchaseTarget}
        onClose={() => setPurchaseTarget(null)}
        onDone={(msg) => showToast(msg, 'success')}
      />
    </SafeAreaView>
  );
}

/** Bordo "Fiyatı düştü · eski → yeni" ya da "Stoğa geldi · fiyat" etiketi. */
function HaberEtiketi({ haber }: { haber: KayitHaberi | undefined }) {
  const { t, i18n } = useTranslation();
  if (!haber) return null;
  const fiyat = (minor: number) => {
    try {
      return new Intl.NumberFormat(i18n.language, {
        style: 'currency',
        currency: haber.paraBirimi,
      }).format(minor / 100);
    } catch {
      return `${(minor / 100).toFixed(2)} ${haber.paraBirimi}`;
    }
  };
  const metin =
    haber.tur === 'price_drop' && haber.eskiFiyat !== null
      ? t('saved.newsPriceDrop', { from: fiyat(haber.eskiFiyat), to: fiyat(haber.yeniFiyat) })
      : t('saved.newsBackInStock', { price: fiyat(haber.yeniFiyat) });
  return (
    <View style={styles.newsTag}>
      {haber.okunmadi ? <View style={styles.newsDot} /> : null}
      <Ionicons
        name={haber.tur === 'price_drop' ? 'trending-down' : 'bag-check-outline'}
        size={12}
        color={theme.colors.blush}
      />
      <Text style={styles.newsTagText}>{metin}</Text>
    </View>
  );
}

function SwipeableRow({
  children,
  onDelete,
  onBuy,
}: {
  children: ReactNode;
  onDelete: () => void;
  onBuy?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((e) => {
      const next = startX.value + e.translationX;
      const max = onBuy ? BUY_WIDTH * 1.1 : 0;
      translateX.value = Math.min(max, Math.max(-DELETE_WIDTH * 1.4, next));
    })
    .onEnd(() => {
      if (onBuy && translateX.value > BUY_WIDTH * 0.5) {
        // Sağa kaydırma: satın aldım sheet'ini aç, satırı geri yerine al.
        translateX.value = withSpring(0, { damping: 22, stiffness: 240 });
        runOnJS(onBuy)();
      } else if (translateX.value < -DELETE_WIDTH * 0.5) {
        translateX.value = withSpring(-DELETE_WIDTH, { damping: 22, stiffness: 240 });
      } else {
        translateX.value = withSpring(0, { damping: 22, stiffness: 240 });
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const deletePaneStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, -translateX.value) / DELETE_WIDTH),
  }));

  const buyPaneStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, translateX.value) / BUY_WIDTH),
  }));

  function handleDeletePress() {
    translateX.value = withTiming(
      -Dimensions.get('window').width,
      { duration: 220 },
      (finished) => {
        if (finished) runOnJS(onDelete)();
      },
    );
  }

  return (
    <View style={swipeStyles.wrap}>
      {onBuy ? (
        <Animated.View style={[swipeStyles.buyPane, buyPaneStyle]}>
          <Ionicons name="checkmark-circle" size={18} color={theme.colors.cream} />
          <Text style={swipeStyles.buyText}>
            {buyukHarf(t('purchases.markPurchased'), i18n.language)}
          </Text>
        </Animated.View>
      ) : null}
      <Animated.View style={[swipeStyles.deletePane, deletePaneStyle]}>
        <Pressable onPress={handleDeletePress} style={swipeStyles.deleteBtn}>
          <Ionicons name="trash-outline" size={18} color={theme.colors.cream} />
          <Text style={swipeStyles.deleteText}>{buyukHarf(t('saved.delete'), i18n.language)}</Text>
        </Pressable>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[swipeStyles.surface, rowStyle]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

function PatternFallback() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.pattern]}>
      <Ionicons name="image-outline" size={20} color={theme.colors.mist} />
    </View>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const swipeStyles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  deletePane: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: DELETE_WIDTH,
    backgroundColor: theme.colors.clay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: theme.colors.cream,
    letterSpacing: 2,
  },
  surface: {
    backgroundColor: theme.colors.cream,
  },
  buyPane: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: BUY_WIDTH,
    backgroundColor: theme.colors.sage,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: theme.colors.cream,
    letterSpacing: 1.5,
  },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cream,
  },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  // Ayarlar Profil'in sağ üstünde (Fırsat'takiyle aynı ekranı açar).
  ayarlar: { position: 'absolute', top: 8, right: 24, zIndex: 1 },
  // Keşfet'teki BUTIKA ile aynı yazı tipi, renk ve harf aralığı (sahip isteği).
  brand: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: 6,
    color: theme.colors.bordo,
    // Üstteki "PROFİL" etiketi kalktı; ayarlar dişlisiyle aynı hizada.
    marginTop: 4,
    paddingRight: 40,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  summary: {
    ...theme.type.micro,
    color: theme.colors.gold,
    letterSpacing: 2.5,
  },
  purchasedLink: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 1.5,
  },
  purchasedLinkOn: { color: theme.colors.ink, textDecorationLine: 'underline' },
  seg: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: theme.colors.creamSoft,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    padding: 4,
  },
  segTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 999,
  },
  segTabOn: { backgroundColor: theme.colors.bordoAcik },
  segText: {
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 0.6,
  },
  segTextOn: { color: theme.colors.cream },
  rowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    marginTop: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: `${theme.colors.sage}22`,
  },
  rowBadgeText: {
    ...theme.type.micro,
    fontSize: 9.5,
    color: theme.colors.sage,
    letterSpacing: 0.8,
  },
  cardWrap: { paddingHorizontal: 24 },
  newsBox: {
    marginHorizontal: 24,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.bordo,
    backgroundColor: theme.colors.creamSoft,
    gap: 10,
  },
  newsTitle: {
    ...theme.type.micro,
    color: theme.colors.bordo,
    letterSpacing: 1.4,
  },
  newsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  newsThumb: {
    width: 40,
    height: 50,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: theme.colors.mist,
  },
  newsRowTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: theme.colors.ink,
    lineHeight: 18,
  },
  newsAll: { alignSelf: 'flex-end' },
  newsAllText: {
    ...theme.type.micro,
    color: theme.colors.bordo,
    letterSpacing: 1.2,
    textDecorationLine: 'underline',
  },
  newsTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: theme.colors.bordo,
  },
  newsDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.blush },
  newsTagText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
    color: theme.colors.blush,
  },
  controls: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 12,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 44,
    backgroundColor: theme.colors.bordoZemin,
    borderRadius: 22,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: theme.colors.ink,
    paddingVertical: 0,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'flex-end',
  },
  sortLabel: {
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 2,
  },
  sortActive: {
    color: theme.colors.gold,
  },
  sortDivider: {
    ...theme.type.micro,
    color: theme.colors.mist,
  },
  list: { paddingBottom: 120 },
  otoWrap: { marginBottom: 16 },
  otoSection: { marginBottom: 14 },
  otoTitle: { flex: 1, marginRight: 12 },
  listRecent: { paddingTop: 8 },
  section: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    paddingTop: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 28,
    color: theme.colors.ink,
    letterSpacing: 0.1,
  },
  sectionCount: {
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 2,
  },
  row: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: theme.colors.cream,
  },
  thumb: {
    width: 64,
    height: 80,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: theme.colors.mist,
  },
  pattern: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.creamSoft,
  },
  rowText: { flex: 1, gap: 4 },
  rowTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: theme.colors.ink,
    lineHeight: 20,
  },
  rowHost: {
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 1,
  },
  shareBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  rowAction: {
    width: 34,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingTop: 56,
    gap: 22,
  },
  noResults: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
    paddingTop: 64,
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
  emptyTitle: { color: theme.colors.bordo },
  // Boş Profil: başlığın altında noktalı üç satır.
  emptyLines: { alignSelf: 'stretch', gap: 10 },
  emptyLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  emptyDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: theme.colors.bordo,
  },
  emptyLineText: {
    flex: 1,
    fontFamily: theme.font.body,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.inkMute,
  },
  // Bordo dolgulu yuvarlak düğme, açık renk yazı.
  emptyCta: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
    backgroundColor: theme.colors.bordo,
  },
  emptyCtaText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 2.5,
    color: theme.colors.cream,
  },
});
