import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageLoadEventData } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  trackEvents,
  useBoutique,
  useButikKaydet,
  useKayitliButikler,
} from '../../src/api/queries';
import { Skeleton, SkeletonText } from '../../src/components/Skeleton';
import { Toast } from '../../src/components/Toast';
import { trackBoutiqueOutboundClick } from '../../src/lib/analytics';
import { butikAcmaYuku, kaynakOku, siraOku } from '../../src/lib/butik-kaynagi';
import { buyukHarf } from '../../src/lib/buyuk-harf';
import { isLogoLike } from '../../src/lib/imageFit';
import { webviewRoute } from '../../src/lib/route-text';
import { adresiIsit } from '../../src/lib/site-isitma';
import { theme } from '../../src/theme';

// Kapaktaki kalp (eskiden 21; sahip 3 katını istedi).
const KALP_BOYUT = 63;

export default function BoutiqueDetailScreen() {
  const { t, i18n } = useTranslation();
  // kaynak/oneriId: profildeki öneriden gelindiyse, kaydetme olayına atıf için webview'a taşınır.
  // siralama: vitrinden gelindiyse o anki sıralama; boutique_view olayına eklenir.
  // sira: listeden gelindiyse butiğin o listedeki 1-tabanlı yeri.
  const { id, kaynak, oneriId, siralama, sira } = useLocalSearchParams<{
    id: string;
    kaynak?: string;
    oneriId?: string;
    siralama?: string;
    sira?: string;
  }>();
  const router = useRouter();
  const { data: boutique, isLoading, error } = useBoutique(id);
  const [isLogo, setIsLogo] = useState(false);
  // Kalp: butiği "Butiklerim"e ekler (Kayıtlı sekmesi). Sunucu cevabı gelene kadar iyimser.
  const { data: kayitliButikler } = useKayitliButikler();
  const butikKaydet = useButikKaydet();
  const sunucudaKayitli = !!kayitliButikler?.some((b) => b.id === id);
  const kayitli = butikKaydet.isPending ? !!butikKaydet.variables?.kaydet : sunucudaKayitli;
  // Kalbe basınca küçük bir atış; eklenince "Butiklerim'e eklendi · Gör" notu.
  const kalpOlcek = useSharedValue(1);
  // Kalp durmadan atar (iki vuruş + dinlenme); hareketi azalt açıksa durur.
  const atis = useSharedValue(1);
  const hareketAzalt = useReducedMotion();
  useEffect(() => {
    if (hareketAzalt) return;
    const vur = (olcek: number, ms: number) =>
      withTiming(olcek, { duration: ms, easing: Easing.out(Easing.quad) });
    atis.value = withRepeat(
      withSequence(vur(1.14, 140), vur(1, 140), vur(1.08, 120), vur(1, 160), vur(1, 640)),
      -1,
    );
    return () => cancelAnimation(atis);
  }, [atis, hareketAzalt]);
  const kalpStili = useAnimatedStyle(() => ({
    transform: [{ scale: kalpOlcek.value * atis.value }],
  }));
  const [eklendiNotu, setEklendiNotu] = useState(false);
  function kalbeBas(butikId: string) {
    const kaydet = !kayitli;
    if (kaydet) {
      kalpOlcek.value = withSequence(
        withTiming(1.3, { duration: 160 }),
        withSpring(1, { damping: 10, stiffness: 260 }),
      );
    }
    setEklendiNotu(false);
    butikKaydet.mutate(
      { boutiqueId: butikId, kaydet },
      { onSuccess: () => setEklendiNotu(kaydet) },
    );
  }

  // boutique_view: butiğin sayfası ekranda göründüğünde, bir kez. 1.2.1'den önce "Butiğe git"e
  // basınca outbound tıklamasıyla aynı anda gidiyordu; o tarihten önceki sayılarla kıyaslanmaz.
  const goruntulemeGitti = useRef<string | null>(null);
  const yuklenenId = boutique?.id;
  useEffect(() => {
    if (!yuklenenId || goruntulemeGitti.current === yuklenenId) return;
    goruntulemeGitti.current = yuklenenId;
    trackEvents([
      { type: 'boutique_view', payload: butikAcmaYuku(yuklenenId, kaynak, siralama, sira) },
    ]);
  }, [yuklenenId, kaynak, siralama, sira]);

  // Butiğin adresini önceden ısıt: kullanıcı "Butike git"e basana kadar alan adı çözümlemesi
  // ve güvenli bağlantı hazır olsun (0,1–0,3 sn kazanç).
  const butikAdresi = boutique?.url;
  useEffect(() => {
    if (butikAdresi) adresiIsit(butikAdresi);
  }, [butikAdresi]);

  if (isLoading) {
    return (
      <View style={styles.root}>
        <View style={[styles.heroWrap, { backgroundColor: theme.colors.mist }]} />
        <SafeAreaView edges={['top']} style={[styles.heroSafe, { position: 'absolute', top: 0 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.ink} />
          </Pressable>
        </SafeAreaView>
        <View style={styles.content}>
          <SkeletonText width={60} height={11} />
          <View style={{ height: 12 }} />
          <Skeleton width="70%" height={44} radius={2} />
          <View style={{ height: 20 }} />
          <Skeleton width={48} height={1} />
          <View style={{ height: 20 }} />
          <SkeletonText width="92%" height={14} />
          <View style={{ height: 8 }} />
          <SkeletonText width="78%" height={14} />
        </View>
      </View>
    );
  }

  if (error || !boutique) {
    return (
      <SafeAreaView style={styles.loadingRoot} edges={['top']}>
        <Text style={styles.error}>{t('boutique.notFound')}</Text>
        <Pressable onPress={() => router.back()} style={styles.backTextButton}>
          <Text style={styles.backLabel}>{buyukHarf(t('boutique.back'), i18n.language)}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  function openWebView() {
    if (!boutique) return;
    const iz = trackBoutiqueOutboundClick({
      boutiqueId: boutique.id,
      boutiqueName: boutique.name,
      sourceScreen: 'boutique_detail',
      destinationUrl: boutique.url,
      category: boutique.categoryIds?.[0] ?? null,
      listPosition: siraOku(sira),
      entrySource: kaynakOku(kaynak),
    });
    // replace: WebView'dan çıkınca direkt vitrine dönülür, detay ekranı stack'ta kalmaz
    router.replace(
      webviewRoute({
        iz,
        boutiqueId: boutique.id,
        url: boutique.url,
        name: boutique.name,
        // Açılış perdesinde boş ekran yerine butiğin kapağı görünsün.
        cover: boutique.coverImageUrl,
        ...(kaynak === 'oneri' && oneriId ? { kaynak, oneriId } : {}),
      }),
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.heroWrap, isLogo && styles.heroWrapLogo]}>
        <Image
          source={boutique.coverImageUrl}
          style={isLogo ? styles.heroImgLogo : StyleSheet.absoluteFill}
          contentFit={isLogo ? 'contain' : 'cover'}
          transition={500}
          onLoad={(e: ImageLoadEventData) =>
            setIsLogo(isLogoLike(e.source?.width ?? 0, e.source?.height ?? 0))
          }
        />
        <View style={styles.heroOverlay} />
        <SafeAreaView edges={['top']} style={[styles.heroSafe, styles.heroRow]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.ink} />
          </Pressable>
        </SafeAreaView>
      </View>

      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <Text style={styles.kicker}>{buyukHarf(t('boutique.kicker'), i18n.language)}</Text>
        <Text style={styles.title}>{boutique.name}</Text>
        <View style={styles.rule} />
        {boutique.description ? (
          <Text style={styles.description}>{boutique.description}</Text>
        ) : null}

        {/* Kalp "BUTİKE GİT"in sağ üst köşesinde (sahip isteği). */}
        <View style={styles.ctaWrap}>
          <Pressable style={styles.cta} onPress={openWebView}>
            <Text style={styles.ctaLabel}>{buyukHarf(t('boutique.visit'), i18n.language)}</Text>
            <Ionicons name="arrow-forward" size={16} color={theme.colors.cream} />
          </Pressable>
          <Pressable
            onPress={() => kalbeBas(boutique.id)}
            hitSlop={8}
            style={styles.kalpDugme}
            accessibilityRole="button"
            accessibilityState={{ selected: kayitli }}
            accessibilityLabel={t(kayitli ? 'boutique.unsaveBoutique' : 'boutique.saveBoutique')}
          >
            {/* 3 kat büyük kalp: içi açık pembe, kenarı bordo; kaydedilince içi bordo. */}
            <Animated.View style={kalpStili}>
              <Ionicons
                name="heart"
                size={KALP_BOYUT}
                color={kayitli ? theme.colors.bordo : theme.colors.bordoZemin}
              />
              <Ionicons
                name="heart-outline"
                size={KALP_BOYUT}
                color={theme.colors.bordo}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </Pressable>
        </View>
        <Text style={styles.hostnote}>
          {t('boutique.hostnote')}{' '}
          <Ionicons name="notifications-outline" size={15} color={theme.colors.ink} />
        </Text>
      </ScrollView>

      <Toast
        visible={eklendiNotu}
        message={t('boutique.boutiqueSaved')}
        bottomOffset={40}
        actionLabel={t('boutique.boutiqueSavedSee')}
        onAction={() => {
          setEklendiNotu(false);
          router.push({ pathname: '/(tabs)/saved', params: { sekme: 'butiklerim' } });
        }}
        onClose={() => setEklendiNotu(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: theme.colors.cream,
  },
  error: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 20,
    color: theme.colors.inkMute,
  },
  backTextButton: { padding: 12 },
  backLabel: {
    ...theme.type.micro,
    letterSpacing: 2,
    color: theme.colors.ink,
  },
  heroWrap: {
    height: 380,
    backgroundColor: theme.colors.mist,
    position: 'relative',
  },
  heroWrapLogo: {
    backgroundColor: theme.colors.creamSoft,
  },
  heroImgLogo: {
    position: 'absolute',
    top: 56,
    left: 56,
    right: 56,
    bottom: 56,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: `${theme.colors.cream}00`,
  },
  heroSafe: { paddingHorizontal: 16, paddingTop: 4 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between' },
  // Kalp düğmenin sağ üstünde, düğmeye değmeden (kalp atışında da çakışmasın).
  ctaWrap: { marginTop: KALP_BOYUT + 12 },
  kalpDugme: {
    position: 'absolute',
    top: -KALP_BOYUT - 8,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Kapakla üst üste: hafif gölge, açık zeminde de seçilsin.
    shadowColor: '#0A0A0A',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 64,
  },
  kicker: {
    ...theme.type.micro,
    letterSpacing: 3,
    color: theme.colors.inkMute,
  },
  title: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 44,
    lineHeight: 48,
    color: theme.colors.ink,
    marginTop: 8,
  },
  rule: {
    width: 48,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.gold,
    marginTop: 20,
  },
  description: {
    ...theme.type.body,
    color: theme.colors.inkMute,
    marginTop: 20,
    lineHeight: 26,
  },
  cta: {
    height: 54,
    backgroundColor: theme.colors.bordo,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 6,
  },
  ctaLabel: {
    fontFamily: 'Inter_500Medium',
    color: theme.colors.cream,
    fontSize: 15,
    letterSpacing: 2,
  },
  hostnote: {
    marginTop: 24,
    ...theme.type.caption,
    color: theme.colors.ink,
    lineHeight: 20,
  },
});
