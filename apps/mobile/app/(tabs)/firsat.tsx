import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageLoadEventData } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type FirsatButigi, useFirsatlar } from '../../src/api/queries';
import { Skeleton } from '../../src/components/Skeleton';
import { useGosterimOlcumu } from '../../src/hooks/useGosterimOlcumu';
import { trackFirsatButik, trackFirsatSekmesi } from '../../src/lib/analytics';
import { butikYolu } from '../../src/lib/butik-kaynagi';
import { buyukHarf } from '../../src/lib/buyuk-harf';
import { isLogoLike } from '../../src/lib/imageFit';
import { theme } from '../../src/theme';

// Kapak 4:5'e yakın dikey; kartın solunda.
const KAPAK_GENISLIK = 104;
const KAPAK_YUKSEKLIK = 130;

/**
 * Fırsat sekmesi: "Hangi butiklerde indirim var?" — admin'in fırsat diye işaretlediği
 * butikler (admin sırasıyla). Ayarlar (⚙) eskiden Profil'de olduğu gibi sağ üstte.
 */
export default function FirsatScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useFirsatlar();
  const gosterim = useGosterimOlcumu('firsat', 'firsat', {});

  // Sekmeye her dönüşte tazele: indirimler gün içinde değişebilir.
  useFocusEffect(
    useCallback(() => {
      void refetch().then((r) => trackFirsatSekmesi({ butikSayisi: r.data?.length ?? 0 }));
    }, [refetch]),
  );

  const baslik = (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.kicker}>{buyukHarf(t('firsat.kicker'), i18n.language)}</Text>
        <View style={styles.baslik}>
          <Text
            style={styles.baslikMetni}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {t('firsat.title')}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={() => router.push('/profile/settings')}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('profile.settingsA11y')}
        style={({ pressed }) => [styles.gear, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="settings-outline" size={22} color={theme.colors.ink} />
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={data ?? []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={gosterim.onViewableItemsChanged}
        viewabilityConfig={gosterim.viewabilityConfig}
        ListHeaderComponent={baslik}
        ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
        renderItem={({ item, index }) => (
          <FirsatKarti
            butik={item}
            onPress={() => {
              trackFirsatButik({ boutiqueId: item.id, boutiqueName: item.name, sira: index + 1 });
              router.push(butikYolu(item.id, 'firsat', undefined, index + 1));
            }}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={theme.colors.gold}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: 14 }}>
              <Skeleton height={KAPAK_YUKSEKLIK + 24} radius={8} />
              <Skeleton height={KAPAK_YUKSEKLIK + 24} radius={8} />
            </View>
          ) : (
            // Uç yoksa/hatada da aynı sakin boş durum (eski sunucu → 4xx).
            <View style={styles.bosWrap}>
              <View style={styles.bosCizgi} />
              <Text style={styles.bosMetin}>{t('firsat.empty')}</Text>
              <View style={styles.bosCizgi} />
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

function FirsatKarti({ butik, onPress }: { butik: FirsatButigi; onPress: () => void }) {
  // Kapak logo/banner mı foto mu? Logo ise kırpma, sığdır (BoutiqueCard ile aynı).
  const [isLogo, setIsLogo] = useState(false);
  function onLoad(e: ImageLoadEventData) {
    setIsLogo(isLogoLike(e.source?.width ?? 0, e.source?.height ?? 0));
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={butik.firsatNotu ? `${butik.name}, ${butik.firsatNotu}` : butik.name}
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
      <View style={styles.kartMetin}>
        <Text style={styles.ad} numberOfLines={2}>
          {butik.name}
        </Text>
        {butik.firsatNotu ? (
          <View style={styles.not}>
            <Ionicons name="pricetag-outline" size={12} color={theme.colors.blush} />
            <Text style={styles.notMetni} numberOfLines={2}>
              {butik.firsatNotu}
            </Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.bordo} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  content: { paddingHorizontal: 24, paddingBottom: 40, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8, paddingBottom: 24 },
  headerText: { flex: 1, gap: 10 },
  gear: { padding: 6, marginTop: 6 },
  kicker: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 3,
  },
  // Başlık bordo yuvarlak hapın içinde (seçki ve Butikcan başlıklarıyla aynı).
  baslik: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.bordoAcik,
  },
  baslikMetni: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 20,
    lineHeight: 26,
    color: theme.colors.cream,
  },

  kart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    backgroundColor: theme.colors.creamSoft,
  },
  kapak: {
    width: KAPAK_GENISLIK,
    height: KAPAK_YUKSEKLIK,
    backgroundColor: theme.colors.mist,
    overflow: 'hidden',
    borderRadius: 4,
  },
  kapakLogo: {
    backgroundColor: theme.colors.cream,
    padding: '12%',
  },
  img: { width: '100%', height: '100%' },
  kartMetin: { flex: 1, gap: 10 },
  ad: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 22,
    lineHeight: 26,
    color: theme.colors.ink,
  },
  // İndirim notu: bordo zemin, gül kurusu yazı (uygulamadaki "dikkat" dili).
  not: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.bordo,
    maxWidth: '100%',
  },
  notMetni: {
    flexShrink: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: theme.colors.blush,
  },

  bosWrap: { alignItems: 'center', gap: 16, paddingTop: 48 },
  bosCizgi: { width: 28, height: 1, backgroundColor: theme.colors.gold },
  bosMetin: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 18,
    lineHeight: 24,
    color: theme.colors.inkMute,
    textAlign: 'center',
  },
});
