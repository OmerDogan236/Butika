import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { PostHogMaskView } from 'posthog-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  runOnUI,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUnreadNotificationCount } from '../../src/api/notifications';
import {
  type Boutique,
  type Siralama,
  useBoutiques,
  useButikArama,
  useButikcanArama,
  useCategories,
  useEditorunSecimi,
  useVitrinAyarlari,
} from '../../src/api/queries';
import { useProfilDurumu, useSonTarzTesti } from '../../src/api/tarz-testi';
import { BoutiqueCard } from '../../src/components/BoutiqueCard';
import { BoutiqueCardSkeleton } from '../../src/components/BoutiqueCardSkeleton';
import { EditorunSecimi } from '../../src/components/EditorunSecimi';
import { Empty } from '../../src/components/Empty';
import { KategoriSeridi } from '../../src/components/KategoriSeridi';
import { Skeleton } from '../../src/components/Skeleton';
import { SortControl } from '../../src/components/SortControl';
import { TurHedefi } from '../../src/components/tur/TurHedefi';
import { useAramaKaydi, useAramaOlcumu } from '../../src/hooks/useAramaOlcumu';
import { useDebounce } from '../../src/hooks/useDebounce';
import { useGosterimOlcumu } from '../../src/hooks/useGosterimOlcumu';
import { trackCategorySelected, trackSearchResultClick } from '../../src/lib/analytics';
import { butikcanAramasiMi } from '../../src/lib/arama';
import { butikYolu } from '../../src/lib/butik-kaynagi';
import { buyukHarf } from '../../src/lib/buyuk-harf';
import { ilkAktifKategori } from '../../src/lib/category-rail';
import { listeEnAzYukseklik, ustBlokKaymasi } from '../../src/lib/katlanir-baslik';
import { kisiselVarMi, varsayilanSiralama } from '../../src/lib/kisisel-akis';
import { useKisiselStore } from '../../src/stores/kisisel';
import { useOnboardingStore } from '../../src/stores/onboarding';
import { useTurStore } from '../../src/stores/tur';
import { useVitrinStore } from '../../src/stores/vitrin';
import { theme } from '../../src/theme';

// "Butikcan'a sor" düğmesinin başında Butikcan'ın kendi simgesi.
const BUTIKCAN_MASKOT = require('../../assets/butikcan.png');
const COLUMN_GAP = 16;
const ROW_GAP = 22;
const SCREEN_PADDING = 24;
// FAB bu kadar kaydırınca belirir; footer'daki butona bu kadar yaklaşınca tekrar gizlenir
const FAB_SHOW_AFTER = 280;
const FAB_HIDE_NEAR_FOOTER = 220;

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data: categories, isLoading: catsLoading } = useCategories();
  const pinnedIds = useOnboardingStore((s) => s.selectedCategoryIds);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  // Duyuru bildirimi bir kategoriye açıldı (bkz. app/_layout duyuruHedefineGit).
  const { kategori: istenenKategori } = useLocalSearchParams<{ kategori?: string }>();
  const [siralama, setSiralama] = useState<Siralama>('onerilen');
  // Başlığın yanındaki arama kutusu: 2+ harf yazılınca vitrinin üstünde sonuç listesi açılır.
  const [arama, setArama] = useState('');
  const aramaQ = useDebounce(arama, 300).trim();
  const aramaAktif = arama.trim().length >= 2 && aramaQ.length >= 2;
  const { data: aramaSonuc, isFetching: aramaYukleniyor } = useButikArama(aramaQ);
  // "Ara" tuşu + cümle (3+ kelime): Butikcan'ın anlayışıyla sıralı butikler. Metin
  // değişince (arama.trim() !== sorgu) kendiliğinden anlık aramaya dönülür.
  const butikcanArama = useButikcanArama();
  const [butikcanSorgu, setButikcanSorgu] = useState<string | null>(null);
  const [butikcanListe, setButikcanListe] = useState<Boutique[] | null>(null);
  const butikcanGecerli = butikcanSorgu !== null && butikcanSorgu === arama.trim();
  const butikcanBekliyor = butikcanGecerli && butikcanListe === null && butikcanArama.isPending;
  const butikcanSiralamasi = butikcanGecerli && butikcanListe !== null && butikcanListe.length > 0;
  // Sonuçlar yazarken canlı gelir; arama, yazma bitince ya da "Ara"ya basınca bir kez sayılır.
  // Butikcan sıralaması (cümle + Ara) ayrı arama sayılır: search_mode = 'butikcan'.
  const aramaOlcer = useAramaOlcumu('boutique');
  useEffect(() => {
    if (butikcanGecerli && butikcanSorgu !== null) {
      if (butikcanListe !== null) {
        aramaOlcer.sonuclarGeldi(butikcanSorgu, butikcanListe.length, 'butikcan');
        aramaOlcer.gonder();
      }
      return;
    }
    if (!aramaAktif || arama.trim() !== aramaQ) {
      aramaOlcer.vazgec();
      return;
    }
    if (!aramaYukleniyor && aramaSonuc)
      aramaOlcer.sonuclarGeldi(aramaQ, aramaSonuc.boutiques.length);
  }, [
    aramaOlcer,
    butikcanGecerli,
    butikcanSorgu,
    butikcanListe,
    aramaAktif,
    arama,
    aramaQ,
    aramaYukleniyor,
    aramaSonuc,
  ]);
  const aramaGonder = () => {
    const q = arama.trim();
    if (!butikcanAramasiMi(q)) {
      aramaOlcer.gonder();
      return;
    }
    if (butikcanArama.isPending) return;
    // Cümle Butikcan'a gidiyor: bekleyen anlık arama ayrıca sayılmasın.
    aramaOlcer.vazgec();
    setButikcanSorgu(q);
    setButikcanListe(null);
    butikcanArama.mutate(q, {
      onSuccess: (r) => setButikcanListe(r.kullanilabilir ? r.boutiques : []),
      onError: () => setButikcanListe([]),
    });
  };
  const aramaListesi = !aramaAktif
    ? []
    : butikcanSiralamasi
      ? (butikcanListe ?? [])
      : (aramaSonuc?.boutiques ?? []);
  // Arama sonuç kartlarının gösterimi: arama sayılınca (search_id belli olunca) gönderilir.
  const aramaKaydi = useAramaKaydi(aramaOlcer);
  const aramaModu = butikcanSiralamasi ? 'butikcan' : 'canli';
  const aramaMetni = butikcanSiralamasi ? (butikcanSorgu ?? '') : aramaQ;
  const aramaGosterimi = useGosterimOlcumu(
    'arama',
    `${aramaModu}:${aramaMetni}`,
    aramaKaydi && aramaKaydi.mode === aramaModu && aramaKaydi.query === aramaMetni
      ? { search_id: aramaKaydi.searchId, search_mode: aramaModu }
      : null,
  );
  const aramaSonucuAc = (id: string, sira: number) => {
    trackSearchResultClick({
      searchId: aramaOlcer.gonder()?.searchId ?? null,
      position: sira,
      resultType: 'boutique',
      boutiqueId: id,
    });
    router.push(butikYolu(id, 'arama', undefined, sira));
  };

  useEffect(() => {
    if (!istenenKategori || !categories) return;
    // Bu pazarda olmayan (ya da silinmiş) kategori: vitrin olduğu gibi açılır.
    if (categories.some((c) => c.id === istenenKategori)) {
      setActiveCat(istenenKategori);
      listeRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
    router.setParams({ kategori: undefined });
  }, [istenenKategori, categories, router]);

  useEffect(() => {
    if (!categories || categories.length === 0) return;
    // KADIN | ERKEK değişince eski kategori yeni listede yoktur: baştan seçilir.
    if (activeCat && categories.some((c) => c.id === activeCat)) return;
    // Açılışta: varsa onboarding'de seçilen ilk kategori, yoksa listenin ilki.
    setActiveCat(ilkAktifKategori(categories, pinnedIds));
  }, [categories, activeCat, pinnedIds]);

  const {
    data: boutiques,
    isLoading,
    refetch,
    isRefetching,
  } = useBoutiques(activeCat ?? undefined, siralama);
  const { refetch: editorTazele } = useEditorunSecimi();
  // Seçki başlığı ve "en son sürüm": aşağı çekince de yenilensin (yoksa 5 dk önbellekte kalır).
  const { refetch: ayarTazele } = useVitrinAyarlari();

  const vitrinGosterimi = useGosterimOlcumu('vitrin', `${activeCat}:${siralama}`, {
    category_id: activeCat,
    siralama,
  });

  const showSkeletonGrid = isLoading || catsLoading;
  // skeleton kategorileri için 4 placeholder
  const skeletonCategoryWidths = [92, 74, 104, 84];

  const turuBaslat = useTurStore((s) => s.turuBaslat);
  const turGorulenler = useTurStore((s) => s.gorulenler);
  // Tur YALNIZ ekran odaktayken baslar. Sekme ekranlari bir kez ziyaret edilince
  // unmount olmuyor; odak kontrolu olmadan, baska bir sekmedeyken `gorulenler`
  // degistiginde (ornegin Profil'deki "Turu tekrar goster") bu efekt yeniden
  // calisip turu yanlis ekranin ustunde aciyordu.
  useFocusEffect(
    useCallback(() => {
      if (showSkeletonGrid) return;
      if (turGorulenler === null) return;
      // Olcumlerin yerlesmesi icin bir kare bekle.
      const zamanlayici = setTimeout(() => turuBaslat('vitrin'), 400);
      return () => clearTimeout(zamanlayici);
    }, [showSkeletonGrid, turGorulenler, turuBaslat]),
  );

  // Tarz testi kendiliğinden sorulmaz (1.2.4); yalnız Ayarlar ve sıralama menüsünden açılır.
  const son = useSonTarzTesti();
  const bekleyenVar = useKisiselStore((s) => s.bekleyenVar);
  // Telefonda bekleyen cevap varsa test yapılmış sayılır (gönderim sonraki açılışta).
  const testVar = son.isSuccess ? !!son.data || bekleyenVar : undefined;
  // Test yoksa da sunucuda profil doluysa "Sana özel" görünür ve varsayılan olur (aşama 3).
  const profilDurumu = useProfilDurumu();
  const kisiselVar = kisiselVarMi(testVar, profilDurumu.data?.dolu);
  // Test bilgisi gelince "Sana özel" varsayılan olur; test yoksa o seçenek kalkar.
  useEffect(() => {
    setSiralama((mevcut) => varsayilanSiralama(kisiselVar, mevcut));
  }, [kisiselVar]);

  const fabShown = useSharedValue(0);
  const [fabInteractive, setFabInteractive] = useState(false);
  const listeRef = useAnimatedRef<Animated.FlatList<Boutique>>();
  // Katlanır seçki: liste yerinde durur (içeriği seçki + kategori şeridi kadar aşağıdan
  // başlar); liste kaydıkça üst katman seçki yüksekliği kadar yukarı kayar, kategori
  // şeridi üstte kalır. Aşağı çekince (yenileme) katman da iner.
  const kaydirmaY = useSharedValue(0);
  const blokY = useSharedValue(0);
  const [blokYukseklik, setBlokYukseklik] = useState(0);
  const [seritYukseklik, setSeritYukseklik] = useState(0);
  const [alanYukseklik, setAlanYukseklik] = useState(0);
  const onBlokLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      blokY.value = h;
      setBlokYukseklik(h);
    },
    [blokY],
  );
  const ustKatmanStili = useAnimatedStyle(() => {
    const y = kaydirmaY.value;
    const kayma = y < 0 ? y : ustBlokKaymasi(y, blokY.value);
    return { transform: [{ translateY: -kayma }] };
  });
  // Seçkinin üstünde dikey sürükleme de listeyi kaydırsın (yatay kayma ve dokunma etkilenmez).
  const surukBaslangic = useSharedValue(0);
  const blokSurukle = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-15, 15])
        .onStart(() => {
          surukBaslangic.value = kaydirmaY.value;
        })
        .onUpdate((e) => {
          const h = blokY.value;
          if (surukBaslangic.value > h) return;
          const hedef = Math.min(Math.max(surukBaslangic.value - e.translationY, 0), h);
          scrollTo(listeRef, 0, hedef, false);
        })
        .onEnd((e) => {
          const h = blokY.value;
          if (surukBaslangic.value > h || h <= 0) return;
          const y = Math.min(Math.max(surukBaslangic.value - e.translationY, 0), h);
          const kapat = e.velocityY < -300 || (e.velocityY <= 300 && y > h / 2);
          scrollTo(listeRef, 0, kapat ? h : 0, true);
        }),
    [blokY, kaydirmaY, listeRef, surukBaslangic],
  );
  const onScroll = useAnimatedScrollHandler((e) => {
    const y = e.contentOffset.y;
    kaydirmaY.value = y;
    const distanceToBottom = e.contentSize.height - (y + e.layoutMeasurement.height);
    const next = y > FAB_SHOW_AFTER && distanceToBottom > FAB_HIDE_NEAR_FOOTER ? 1 : 0;
    if (next !== fabShown.value) {
      fabShown.value = next;
      runOnJS(setFabInteractive)(next === 1);
    }
  });
  const fabProgress = useDerivedValue(() => withTiming(fabShown.value, { duration: 200 }));
  const fabStyle = useAnimatedStyle(() => ({
    opacity: fabProgress.value,
    transform: [
      { translateY: (1 - fabProgress.value) * 16 },
      { scale: 0.92 + fabProgress.value * 0.08 },
    ],
  }));

  // Vitrin turu sıralama düğmesini de göstersin: tur açılınca liste başa döner.
  const vitrinTuruAcik = useTurStore((s) => s.aktifTur === 'vitrin');
  useEffect(() => {
    if (vitrinTuruAcik) listeRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [vitrinTuruAcik]);

  const vitrinCinsiyeti = useVitrinStore((s) => s.cinsiyet);
  const kategorilerHazir = !!categories && categories.length > 0;
  const okunmamis = useUnreadNotificationCount().data?.count ?? 0;

  const kategoriSec = (id: string) => {
    if (!categories) return;
    if (id !== activeCat)
      trackCategorySelected({
        categoryId: id,
        categoryName: categories.find((c) => c.id === id)?.name.trim() ?? null,
        previousCategoryId: activeCat,
        isPinned: pinnedIds.includes(id),
      });
    setActiveCat(id);
  };

  // Liste başı: yalnız sıralama (seçki ve kategori şeridi üstteki katlanır katmanda).
  const listeBasi = (
    <View>
      {kategorilerHazir ? (
        <View style={styles.sortRow}>
          <TurHedefi hedefId="vitrin.sirala">
            <SortControl
              value={siralama}
              onChange={setSiralama}
              kisiselVar={kisiselVar}
              testVar={testVar === true}
              onTarziGuncelle={() =>
                router.push({
                  pathname: '/tarz-testi',
                  params: { kaynak: 'siralama_menusu' },
                })
              }
            />
          </TurHedefi>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.baslikSatiri}>
          <TurHedefi hedefId="vitrin.tanitim">
            <Text style={styles.marka}>BUTIKA</Text>
          </TurHedefi>
          <View style={styles.taraf} accessibilityRole="tablist">
            {(['kadin', 'erkek'] as const).map((c) => {
              const secili = vitrinCinsiyeti === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => {
                    if (secili) return;
                    void useVitrinStore.getState().sec(c);
                    listeRef.current?.scrollToOffset({ offset: 0, animated: false });
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: secili }}
                  hitSlop={6}
                  style={[styles.tarafSecenek, secili && styles.tarafSecenekSecili]}
                >
                  <Text style={[styles.tarafYazi, secili && styles.tarafYaziSecili]}>
                    {buyukHarf(
                      t(c === 'kadin' ? 'onboarding.cardWomen' : 'onboarding.cardMen'),
                      i18n.language,
                    )}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => router.push('/notifications')}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={
              okunmamis > 0
                ? t('saved.notificationsBoxUnread', { count: okunmamis })
                : t('saved.notificationsBox')
            }
            style={({ pressed }) => [styles.zil, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="notifications-outline" size={20} color={theme.colors.bordo} />
            {okunmamis > 0 ? <View style={styles.zilNokta} /> : null}
          </Pressable>
        </View>
        <PostHogMaskView style={styles.aramaKutusu}>
          <Ionicons name="search" size={18} color={theme.colors.bordoAcik} />
          <TextInput
            value={arama}
            onChangeText={setArama}
            placeholder={t('showcase.aramaIpucu')}
            placeholderTextColor={theme.colors.inkMute}
            style={styles.aramaGirdi}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={aramaGonder}
            clearButtonMode="never"
          />
          {arama.length > 0 ? (
            <Pressable
              onPress={() => setArama('')}
              hitSlop={10}
              accessibilityLabel={t('showcase.aramaTemizle')}
            >
              <Ionicons name="close-circle" size={18} color={theme.colors.inkMute} />
            </Pressable>
          ) : null}
        </PostHogMaskView>
      </View>

      <View style={styles.govde} onLayout={(e) => setAlanYukseklik(e.nativeEvent.layout.height)}>
        <Animated.FlatList<Boutique>
          ref={listeRef}
          style={StyleSheet.absoluteFill}
          data={boutiques ?? []}
          keyExtractor={(b) => b.id}
          numColumns={2}
          columnWrapperStyle={{ gap: COLUMN_GAP }}
          contentContainerStyle={[
            styles.list,
            {
              paddingTop: blokYukseklik + seritYukseklik,
              minHeight: listeEnAzYukseklik(alanYukseklik, blokYukseklik),
            },
          ]}
          removeClippedSubviews={false}
          onViewableItemsChanged={vitrinGosterimi.onViewableItemsChanged}
          viewabilityConfig={vitrinGosterimi.viewabilityConfig}
          onScroll={onScroll}
          scrollEventThrottle={16}
          ItemSeparatorComponent={() => <View style={{ height: ROW_GAP }} />}
          refreshControl={
            <RefreshControl
              progressViewOffset={blokYukseklik + seritYukseklik}
              refreshing={isRefetching}
              onRefresh={() => {
                refetch();
                editorTazele();
                ayarTazele();
              }}
              tintColor={theme.colors.gold}
            />
          }
          ListHeaderComponent={listeBasi}
          ListHeaderComponentStyle={styles.listeBasi}
          renderItem={({ item, index }) => (
            <View style={styles.cardWrap}>
              <BoutiqueCard
                boutique={item}
                onPress={() => router.push(butikYolu(item.id, 'vitrin', siralama, index + 1))}
              />
            </View>
          )}
          ListFooterComponent={
            boutiques && boutiques.length > 0 ? (
              <Pressable
                onPress={() => router.push('/suggest')}
                style={({ pressed }) => [styles.suggestFooter, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.suggestRule} />
                <Text style={styles.suggestKicker}>
                  {buyukHarf(t('showcase.suggestKicker'), i18n.language)}
                </Text>
                <View style={styles.suggestBtn}>
                  <Text style={styles.suggestBtnText}>
                    {buyukHarf(t('showcase.suggest'), i18n.language)}
                  </Text>
                </View>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            showSkeletonGrid ? (
              <View>
                {[0, 1, 2].map((row) => (
                  <View key={row} style={[styles.skeletonRow, row > 0 && { marginTop: ROW_GAP }]}>
                    <View style={styles.cardWrap}>
                      <BoutiqueCardSkeleton />
                    </View>
                    <View style={styles.cardWrap}>
                      <BoutiqueCardSkeleton />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Empty message={t('showcase.emptyCategory')} />
            )
          }
        />
        <Animated.View style={[styles.ustKatman, ustKatmanStili]}>
          <GestureDetector gesture={blokSurukle}>
            <View onLayout={onBlokLayout}>
              <EditorunSecimi
                onSec={(id, sira) => router.push(butikYolu(id, 'secki', undefined, sira))}
              />
            </View>
          </GestureDetector>
          <View onLayout={(e) => setSeritYukseklik(e.nativeEvent.layout.height)}>
            <TurHedefi hedefId="vitrin.kategoriler">
              {kategorilerHazir && categories ? (
                <KategoriSeridi
                  categories={categories}
                  activeId={activeCat}
                  onChange={(id) => {
                    kategoriSec(id);
                    // Seçki kapalıysa kapalı kalsın; ızgara baştan başlasın.
                    listeRef.current?.scrollToOffset({
                      offset: Math.min(Math.max(kaydirmaY.value, 0), blokYukseklik),
                      animated: false,
                    });
                  }}
                  pinnedIds={pinnedIds}
                />
              ) : (
                <View style={styles.seritIskelet}>
                  {skeletonCategoryWidths.map((w) => (
                    <Skeleton key={w} width={w} height={16} radius={2} />
                  ))}
                </View>
              )}
            </TurHedefi>
          </View>
        </Animated.View>

        {aramaAktif ? (
          <View style={styles.aramaKatmani}>
            <FlatList<Boutique>
              data={butikcanBekliyor ? [] : aramaListesi}
              keyExtractor={(b) => b.id}
              numColumns={2}
              columnWrapperStyle={{ gap: COLUMN_GAP }}
              contentContainerStyle={styles.aramaListe}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              onViewableItemsChanged={aramaGosterimi.onViewableItemsChanged}
              viewabilityConfig={aramaGosterimi.viewabilityConfig}
              ItemSeparatorComponent={() => <View style={{ height: ROW_GAP }} />}
              ListHeaderComponent={
                aramaListesi.length > 0 && !butikcanBekliyor ? (
                  <View style={[styles.paneHeader, styles.aramaBaslik]}>
                    <Text style={styles.paneTitle}>
                      {butikcanSiralamasi
                        ? t('showcase.butikcanSiraladi')
                        : t('showcase.aramaSonuc', { count: aramaListesi.length })}
                    </Text>
                    <View style={styles.paneRule} />
                  </View>
                ) : null
              }
              renderItem={({ item, index }) => (
                <View style={styles.cardWrap}>
                  <BoutiqueCard
                    boutique={item}
                    compact
                    onPress={() => aramaSonucuAc(item.id, index + 1)}
                  />
                </View>
              )}
              ListEmptyComponent={
                butikcanBekliyor ? (
                  <View style={styles.aramaBekle}>
                    <ActivityIndicator color={theme.colors.ink} />
                  </View>
                ) : aramaYukleniyor || !aramaSonuc ? (
                  <View style={styles.skeletonRow}>
                    <View style={styles.cardWrap}>
                      <BoutiqueCardSkeleton />
                    </View>
                    <View style={styles.cardWrap}>
                      <BoutiqueCardSkeleton />
                    </View>
                  </View>
                ) : (
                  <View style={styles.aramaBos}>
                    <Text style={styles.aramaBosMetin}>
                      {t('showcase.aramaBos', { q: aramaQ })}
                    </Text>
                    <Pressable
                      onPress={() =>
                        router.push({ pathname: '/butikcan', params: { soru: aramaQ } })
                      }
                      style={({ pressed }) => [styles.suggestBtn, pressed && { opacity: 0.7 }]}
                    >
                      <View style={styles.butikcanaSorSatir}>
                        <Image
                          source={BUTIKCAN_MASKOT}
                          style={styles.butikcanMaskot}
                          contentFit="contain"
                        />
                        <Text style={styles.suggestBtnText}>
                          {buyukHarf(t('showcase.butikcanaSor'), i18n.language)}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                )
              }
            />
          </View>
        ) : null}
      </View>

      <Animated.View
        pointerEvents={fabInteractive && !aramaAktif ? 'auto' : 'none'}
        style={[styles.fabWrap, fabStyle, aramaAktif && { opacity: 0 }]}
      >
        {/* FAB ~280 px kaydirilana kadar opacity 0 + pointerEvents 'none'.
            `etkin` olmadan `onLayout` gorunmez butonu da olcuyordu ve tur sag
            alt kosede BOS bir dikdortgeni aydinlatiyordu. */}
        <TurHedefi hedefId="vitrin.butikOner" etkin={fabInteractive}>
          <Pressable
            onPress={() => router.push('/suggest')}
            style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="add" size={18} color={theme.colors.cream} />
            <Text style={styles.fabText}>{buyukHarf(t('showcase.suggest'), i18n.language)}</Text>
          </Pressable>
        </TurHedefi>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  govde: { flex: 1, overflow: 'hidden' },
  ustKatman: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.cream,
  },
  header: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 14,
  },
  baslikSatiri: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // KADIN | ERKEK geçişi: seçili taraf bordo dolgulu.
  taraf: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 999,
    backgroundColor: theme.colors.bordoZemin,
  },
  tarafSecenek: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  tarafSecenekSecili: { backgroundColor: theme.colors.bordo },
  tarafYazi: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.6,
    color: theme.colors.bordo,
  },
  tarafYaziSecili: { color: theme.colors.cream },
  zil: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.mist,
    backgroundColor: theme.colors.creamSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zilNokta: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.bordo,
  },
  // Arama en üstte, tam genişlik (1.2.4 tasarımı).
  aramaKutusu: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 4,
    backgroundColor: theme.colors.bordoZemin,
  },
  aramaGirdi: {
    flex: 1,
    paddingVertical: 0,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: theme.colors.ink,
  },
  seritIskelet: {
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: SCREEN_PADDING,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.mist,
  },
  list: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: 120,
  },
  // Liste başındaki şeritler kendi kenar boşluklarıyla gelir.
  listeBasi: { marginHorizontal: -SCREEN_PADDING, marginBottom: 18, paddingTop: 10 },
  // "Butika Vitrin" başlığı solda, sıralama sağda; altında bordo ayraç
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 6,
  },
  paneHeader: {
    flexShrink: 1,
    gap: 10,
  },
  aramaBaslik: { paddingBottom: 18 },
  paneTitle: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 21,
    lineHeight: 25,
    color: theme.colors.ink,
  },
  paneRule: {
    width: 28,
    height: 1,
    backgroundColor: theme.colors.gold,
  },
  // Arama sonuçları vitrinin (blok, raf, liste) üstünü tamamen örter.
  aramaKatmani: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.cream,
  },
  aramaListe: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 8,
    paddingBottom: 120,
  },
  aramaBos: {
    alignItems: 'center',
    gap: 18,
    paddingTop: 48,
    paddingHorizontal: 12,
  },
  butikcanMaskot: { width: 22, height: 22 },
  butikcanaSorSatir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aramaBekle: {
    alignItems: 'center',
    paddingTop: 48,
  },
  aramaBosMetin: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 18,
    lineHeight: 24,
    color: theme.colors.ink,
    textAlign: 'center',
  },
  // Keşfet başlığı yerine yalnız marka (sahip isteği, 25 Eki).
  marka: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: 6,
    color: theme.colors.bordo,
  },
  cardWrap: {
    flex: 1,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: COLUMN_GAP,
  },
  suggestFooter: {
    marginTop: 48,
    alignItems: 'center',
    gap: 14,
    paddingVertical: 20,
  },
  suggestRule: {
    width: 48,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.gold,
  },
  suggestKicker: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 2.5,
  },
  suggestBtn: {
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: theme.colors.gold,
  },
  suggestBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 2.5,
    color: theme.colors.gold,
  },
  fabWrap: {
    position: 'absolute',
    right: SCREEN_PADDING,
    bottom: 20,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingLeft: 18,
    paddingRight: 22,
    borderRadius: 24,
    backgroundColor: theme.colors.bordo,
    shadowColor: '#0A0A0A',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 2,
    color: theme.colors.cream,
  },
});
