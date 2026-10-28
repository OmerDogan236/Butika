import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { type KayitliButik, useFirsatlar, useKayitliButikler } from '../api/queries';
import { addedLabel } from '../lib/addedLabel';
import { butikYolu } from '../lib/butik-kaynagi';
import { buyukHarf } from '../lib/buyuk-harf';
import { theme } from '../theme';

/** Kayıtlı butiklerden şu an Fırsat'ta (indirimde) olanların kimlikleri → fırsat notu. */
function useIndirimdekiler() {
  const { data } = useFirsatlar();
  return useMemo(() => new Map((data ?? []).map((b) => [b.id, b.firsatNotu ?? ''])), [data]);
}

// Profil'deki (Senin Butika'n) "Butiklerim" şeridi: kalp ya da Instagram'dan
// "Paylaş… → Butika" ile kaydedilen butikler. İndirimdekinin halkası bordo.
// Başındaki "+ Ekle" Keşfet'i açar (yeni butik bulmak için); "TÜMÜ" Butiklerim bölümünü.
export function ButiklerimSeridi({ onTumu, onEkle }: { onTumu: () => void; onEkle: () => void }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data } = useKayitliButikler();
  const indirimde = useIndirimdekiler();
  const butikler = data ?? [];

  return (
    <View style={styles.root}>
      <View style={styles.baslikSatiri}>
        <Text style={styles.baslik}>{t('saved.boutiquesTitle')}</Text>
        {butikler.length > 0 ? (
          <Pressable onPress={onTumu} hitSlop={10} accessibilityRole="button">
            <Text style={styles.tumu}>
              {buyukHarf(t('saved.boutiquesAll', { count: butikler.length }), i18n.language)} ›
            </Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={butikler}
        keyExtractor={(b) => b.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Pressable
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
            onPress={onEkle}
            accessibilityRole="button"
            accessibilityLabel={t('saved.boutiquesAddA11y')}
          >
            <View style={styles.ekle}>
              <Ionicons name="add" size={24} color={theme.colors.inkMute} />
            </View>
            <Text style={[styles.name, styles.ekleYazi]}>{t('saved.boutiquesAdd')}</Text>
          </Pressable>
        }
        renderItem={({ item }) => {
          const indirimli = indirimde.has(item.id);
          return (
            <Pressable
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
              onPress={() => router.push(butikYolu(item.id, 'kayitli'))}
              accessibilityRole="button"
              accessibilityLabel={
                indirimli ? `${item.name}, ${t('saved.boutiquesOnSale')}` : item.name
              }
            >
              <ButikYuvarlagi butik={item} indirimli={indirimli} />
              <Text style={[styles.name, indirimli && styles.nameIndirim]} numberOfLines={1}>
                {indirimli ? t('saved.boutiquesOnSale') : item.name}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

/** Butiğin yuvarlak logosu; indirimdeyse bordo halka, Instagram'dan geldiyse küçük rozet. */
function ButikYuvarlagi({
  butik,
  indirimli,
  boyut = 60,
}: {
  butik: KayitliButik;
  indirimli: boolean;
  boyut?: number;
}) {
  return (
    <View
      style={[
        styles.halka,
        { width: boyut, height: boyut, borderRadius: boyut / 2 },
        indirimli && styles.halkaIndirim,
      ]}
    >
      <Image
        source={{ uri: butik.logoUrl ?? butik.coverImageUrl }}
        style={styles.logo}
        contentFit="cover"
        transition={200}
      />
      {butik.kaynak === 'instagram' ? (
        <View style={styles.igRozet}>
          <Ionicons name="logo-instagram" size={11} color={theme.colors.ink} />
        </View>
      ) : null}
    </View>
  );
}

/** Profil → Butiklerim bölümü: her butik bir satır, altta "Instagram'dan butik ekle". */
export function ButiklerimListesi() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data, isLoading } = useKayitliButikler();
  const indirimde = useIndirimdekiler();
  const butikler = data ?? [];

  const kaynakMetni = (b: KayitliButik) => {
    const when = addedLabel(b.createdAt).toLocaleLowerCase(i18n.language);
    if (b.kaynak === 'instagram') return t('saved.sourceInstagram', { when });
    if (b.kaynak === 'site') return t('saved.sourceSite', { when });
    return t('saved.sourceApp', { when });
  };

  return (
    <FlatList
      data={butikler}
      keyExtractor={(b) => b.id}
      contentContainerStyle={styles.liste}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => {
        const not = indirimde.get(item.id);
        const indirimli = not !== undefined;
        return (
          <Pressable
            style={({ pressed }) => [styles.satir, pressed && { opacity: 0.7 }]}
            onPress={() => router.push(butikYolu(item.id, 'kayitli'))}
            accessibilityRole="button"
          >
            <ButikYuvarlagi butik={item} indirimli={indirimli} boyut={56} />
            <View style={styles.satirMetin}>
              <Text style={styles.satirAd} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.satirMeta}>{kaynakMetni(item)}</Text>
              {indirimli ? (
                <View style={styles.indirimEtiketi}>
                  <Text style={styles.indirimYazi} numberOfLines={1}>
                    {not || t('saved.boutiquesOnSale')}
                  </Text>
                </View>
              ) : null}
              {item.onayBekliyor ? (
                <View style={styles.incelemeEtiketi}>
                  <Text style={styles.incelemeYazi}>
                    {buyukHarf(t('saved.boutiquesInReview'), i18n.language)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.inkFaint} />
          </Pressable>
        );
      }}
      ListEmptyComponent={
        // Yalnız henüz butik yokken; butik eklenince bu açıklama görünmez.
        isLoading ? null : <Text style={styles.bos}>{t('saved.boutiquesIntro')}</Text>
      }
      ListFooterComponent={
        <View style={styles.yardim}>
          <View style={styles.yardimBaslik}>
            <Ionicons name="logo-instagram" size={18} color={theme.colors.ink} />
            <Text style={styles.yardimBaslikYazi}>{t('saved.helpTitle')}</Text>
          </View>
          {[t('saved.helpStep1'), t('saved.helpStep2'), t('saved.helpStep3')].map((adim, i) => (
            <View key={adim} style={styles.adim}>
              <View style={styles.adimNo}>
                <Text style={styles.adimNoYazi}>{i + 1}</Text>
              </View>
              <Text style={styles.adimYazi}>{adim}</Text>
            </View>
          ))}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: 4, paddingBottom: 12 },
  baslikSatiri: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 10,
  },
  baslik: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 21,
    lineHeight: 25,
    color: theme.colors.ink,
  },
  tumu: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 2,
    color: theme.colors.gold,
  },
  list: { paddingHorizontal: 24, gap: 14 },
  item: { width: 64, alignItems: 'center' },
  ekle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ekleYazi: { color: theme.colors.inkMute },
  halka: {
    padding: 2,
    borderWidth: 1.5,
    borderColor: theme.colors.mist,
  },
  halkaIndirim: { borderColor: theme.colors.bordo, borderWidth: 2 },
  logo: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: theme.colors.mist,
  },
  igRozet: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.cream,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: 6,
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.colors.ink,
    textAlign: 'center',
  },
  nameIndirim: { color: theme.colors.bordo, fontFamily: 'Inter_500Medium' },
  liste: { paddingHorizontal: 24, paddingBottom: 120 },
  satir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.mist,
  },
  satirMetin: { flex: 1, gap: 4 },
  satirAd: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 20,
    lineHeight: 24,
    color: theme.colors.ink,
  },
  satirMeta: { fontFamily: theme.font.body, fontSize: 12, color: theme.colors.inkMute },
  indirimEtiketi: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.bordo,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  indirimYazi: { fontFamily: 'Inter_500Medium', fontSize: 11, color: theme.colors.blush },
  incelemeEtiketi: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: theme.colors.goldSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  incelemeYazi: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    letterSpacing: 1.2,
    color: theme.colors.gold,
  },
  bos: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 19,
    lineHeight: 27,
    color: theme.colors.inkMute,
    textAlign: 'center',
    paddingTop: 32,
    paddingBottom: 8,
  },
  yardim: {
    marginTop: 20,
    backgroundColor: theme.colors.creamSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    borderRadius: 8,
    padding: 16,
    gap: 10,
  },
  yardimBaslik: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  yardimBaslikYazi: { fontFamily: 'Inter_500Medium', fontSize: 14, color: theme.colors.ink },
  adim: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  // Numara dairenin tam ortasında (metin satır yüksekliğine göre kaymasın).
  adimNo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginTop: 0,
    backgroundColor: theme.colors.bordo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adimNoYazi: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: 13,
    color: theme.colors.cream,
    textAlign: 'center',
    includeFontPadding: false,
  },
  adimYazi: {
    flex: 1,
    fontFamily: theme.font.body,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.inkMute,
  },
});
