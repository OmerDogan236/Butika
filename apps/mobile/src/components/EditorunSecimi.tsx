import { useIsFocused } from '@react-navigation/native';
import { Image, type ImageLoadEventData } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, type ViewToken } from 'react-native';
import Animated, {
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { type EditorunSecimiButigi, useEditorunSecimi, useVitrinAyarlari } from '../api/queries';
import { useGosterimOlcumu } from '../hooks/useGosterimOlcumu';
import { trackSeckiButik, trackSeckiGorundu } from '../lib/analytics';
import { isLogoLike } from '../lib/imageFit';
import { theme } from '../theme';

// Vitrin ızgarasının dar kartlarından biraz büyük, dikey (4:5'e yakın) kapak.
const KART_GENISLIK = 140;
const KAPAK_YUKSEKLIK = 175;
const KART_ARASI = 12;
const SCREEN_PADDING = 24;
// Kendi kendine kayma hızı (sahibin gönderdiği Lyst videosundan ölçüldü: ~30 pt/sn).
const KAYMA_HIZI = 30;
// Sonsuz şerit: liste 3 kez art arda dizilir, kayma ortadaki kopyada tutulur.
const KOPYA = 3;
const ADIM = KART_GENISLIK + KART_ARASI;

interface Props {
  /** sira: kartın şeritteki 1-tabanlı yeri. */
  onSec: (id: string, sira: number) => void;
}

/**
 * Vitrinin üstünde elle seçilmiş butiklerin yatay şeridi (admin: "Editörün Seçimi").
 * Liste boşsa ya da yükleniyorsa hiçbir şey çizmez — iskelet boşluğu bırakmaz.
 */
export function EditorunSecimi({ onSec }: Props) {
  const { t, i18n } = useTranslation();
  const { data } = useEditorunSecimi();
  // Başlık admin'den (pazar başına, ör. "Sonbahar seçkisi"); boşsa kendi metnimiz.
  const seckiBasligi = useVitrinAyarlari().data?.seckiBasligi;
  const goruldu = useRef(false);
  const sayi = data?.length ?? 0;
  useEffect(() => {
    if (goruldu.current || sayi === 0) return;
    goruldu.current = true;
    trackSeckiGorundu({ butikSayisi: sayi, baslik: seckiBasligi ?? null });
  }, [sayi, seckiBasligi]);
  const gosterim = useGosterimOlcumu('secki', 'secki', {});

  // En az 3 butikte, hareketi azalt kapalıyken ve sekme odaktayken kendiliğinden kayar;
  // parmakla tutulunca durur, bırakınca kaldığı yerden devam eder.
  const hareketAzalt = useReducedMotion();
  const odakta = useIsFocused();
  const kayan = sayi >= 3 && !hareketAzalt;
  const takimGenisligi = sayi * ADIM;
  const liste = useMemo(
    () =>
      kayan && data
        ? Array.from({ length: KOPYA }, (_, k) => data.map((b) => ({ ...b, kopya: k }))).flat()
        : (data ?? []).map((b) => ({ ...b, kopya: 0 })),
    [data, kayan],
  );
  const listeRef = useAnimatedRef<Animated.FlatList<(typeof liste)[number]>>();
  const x = useSharedValue(takimGenisligi);
  const tutuluyor = useSharedValue(false);
  const kare = useFrameCallback((f) => {
    'worklet';
    if (tutuluyor.value || takimGenisligi <= 0) return;
    const dt = (f.timeSincePreviousFrame ?? 16) / 1000;
    let yeni = x.value + KAYMA_HIZI * dt;
    if (yeni >= 2 * takimGenisligi) yeni -= takimGenisligi;
    if (yeni < takimGenisligi) yeni += takimGenisligi;
    x.value = yeni;
    scrollTo(listeRef, yeni, 0, false);
  }, false);
  useEffect(() => {
    kare.setActive(kayan && odakta);
  }, [kare, kayan, odakta]);
  const kaydirma = useAnimatedScrollHandler({
    // Yalnız parmakla kaydırılırken konumu al; kendi kaymamızı geri okumak sayacı geri çekiyordu.
    onScroll: (e) => {
      if (tutuluyor.value) x.value = e.contentOffset.x;
    },
    onBeginDrag: () => {
      tutuluyor.value = true;
    },
    onEndDrag: () => {
      tutuluyor.value = false;
    },
  });
  // Gösterim ölçümünde sıra, kopyadan bağımsız (1–n).
  const gorunurDegisti = ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    gosterim.onViewableItemsChanged({
      viewableItems: viewableItems.map((v) => ({
        ...v,
        index: v.index === null ? null : v.index % Math.max(sayi, 1),
      })),
    });
  };

  if (!data || data.length === 0) return null;

  return (
    <View style={styles.root}>
      <View style={styles.baslik}>
        <View style={styles.baslikHap}>
          <Text style={styles.baslikMetni}>{seckiBasligi || t('showcase.editorTitle')}</Text>
        </View>
      </View>
      <Animated.FlatList
        ref={listeRef}
        horizontal
        data={liste}
        keyExtractor={(b) => `${b.id}-${b.kopya}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.liste}
        contentOffset={kayan ? { x: takimGenisligi, y: 0 } : undefined}
        getItemLayout={(_, index) => ({
          length: ADIM,
          offset: SCREEN_PADDING + ADIM * index,
          index,
        })}
        initialNumToRender={liste.length}
        onScroll={kaydirma}
        scrollEventThrottle={16}
        onViewableItemsChanged={gorunurDegisti}
        viewabilityConfig={gosterim.viewabilityConfig}
        renderItem={({ item, index }) => {
          const sira = (index % sayi) + 1;
          return (
            <EditorKarti
              butik={item}
              onPress={() => {
                trackSeckiButik({
                  boutiqueId: item.id,
                  boutiqueName: item.name,
                  sira,
                  baslik: seckiBasligi ?? null,
                });
                onSec(item.id, sira);
              }}
            />
          );
        }}
      />
    </View>
  );
}

function EditorKarti({ butik, onPress }: { butik: EditorunSecimiButigi; onPress: () => void }) {
  // Kapak logo/banner mı foto mu? Logo ise kırpma, sığdır (BoutiqueCard ile aynı).
  const [isLogo, setIsLogo] = useState(false);
  function onLoad(e: ImageLoadEventData) {
    setIsLogo(isLogoLike(e.source?.width ?? 0, e.source?.height ?? 0));
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={butik.name}
      style={({ pressed }) => [styles.kart, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.kapak, isLogo && styles.kapakLogo]}>
        <Image
          source={butik.coverImageUrl}
          recyclingKey={butik.id}
          style={styles.img}
          contentFit={isLogo ? 'contain' : 'cover'}
          onLoad={onLoad}
          transition={300}
        />
      </View>
      <Text style={styles.ad} numberOfLines={1}>
        {butik.name}
      </Text>
      {butik.editorNotu ? (
        <Text style={styles.not} numberOfLines={2}>
          {butik.editorNotu}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: 18,
  },
  // Başlık, seçili kategori düğmesiyle aynı yuvarlak bordo hap (sahip isteği).
  baslik: {
    paddingHorizontal: SCREEN_PADDING,
    flexDirection: 'row',
    marginBottom: 18,
  },
  baslikHap: {
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: theme.colors.bordoAcik,
  },
  baslikMetni: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: theme.colors.cream,
  },
  liste: {
    paddingHorizontal: SCREEN_PADDING,
    gap: KART_ARASI,
  },
  kart: {
    width: KART_GENISLIK,
    gap: 10,
  },
  kapak: {
    width: KART_GENISLIK,
    height: KAPAK_YUKSEKLIK,
    backgroundColor: theme.colors.mist,
    overflow: 'hidden',
    borderRadius: 4,
  },
  kapakLogo: {
    backgroundColor: theme.colors.creamSoft,
    padding: '14%',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  ad: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 18,
    color: theme.colors.ink,
  },
  not: {
    ...theme.type.caption,
    color: theme.colors.inkMute,
  },
});
