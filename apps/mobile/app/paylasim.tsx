import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { type PaylasimSonucu, usePaylasimiKaydet } from '../src/api/queries';
import { buyukHarf } from '../src/lib/buyuk-harf';
import { useAuthStore } from '../src/stores/auth';
import { theme } from '../src/theme';

// butika://paylasim?metin=… — Android'de telefonun paylaşım menüsünden "Butika" seçilince
// (plugins/paylasim-android.js) buraya gelinir. Kayıt yapılır, sonuç kısa bir kartta görünür
// ve butik kaydedildiyse kullanıcı paylaştığı uygulamaya (Instagram) kendiliğinden döner.
// iOS'ta aynı işi uygulama açılmadan paylaşım penceresi yapar (targets/paylas).
export default function PaylasimEkrani() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { metin } = useLocalSearchParams<{ metin?: string }>();
  const durum = useAuthStore((s) => s.status);
  const kaydet = usePaylasimiKaydet();
  const [sonuc, setSonuc] = useState<PaylasimSonucu | 'hata' | null>(null);
  const gonderildi = useRef(false);

  useEffect(() => {
    if (durum !== 'authenticated' || gonderildi.current) return;
    gonderildi.current = true;
    kaydet
      .mutateAsync(typeof metin === 'string' ? metin : '')
      .then(setSonuc)
      .catch(() => setSonuc('hata'));
  }, [durum, metin, kaydet]);

  function kapat() {
    if (Platform.OS === 'android') BackHandler.exitApp();
    else router.replace('/(tabs)/saved');
  }

  useEffect(() => {
    if (sonuc === null || sonuc === 'hata' || !['kaydedildi', 'eklendi', 'urun_kaydedildi'].includes(sonuc.durum)) return;
    const zamanlayici = setTimeout(kapat, 1800);
    return () => clearTimeout(zamanlayici);
    // kapat her çizimde yeniden oluşur; zamanlayıcı yalnız sonuç gelince kurulur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sonuc]);

  let baslik = t('paylasim.saving');
  let aciklama: string | null = null;
  let gorsel: string | null = null;
  if (durum === 'unauthenticated') {
    baslik = t('paylasim.loginTitle');
    aciklama = t('paylasim.loginBody');
  } else if (sonuc === 'hata') {
    baslik = t('paylasim.failed');
    aciklama = t('paylasim.failedBody');
  } else if (sonuc) {
    switch (sonuc.durum) {
      case 'kaydedildi':
      case 'eklendi':
        baslik = t('paylasim.saved', { name: sonuc.butik.name });
        aciklama = t(sonuc.durum === 'eklendi' ? 'paylasim.addedBody' : 'paylasim.savedBody');
        gorsel = sonuc.butik.logoUrl ?? sonuc.butik.coverImageUrl;
        break;
      case 'oneri_alindi':
        baslik = t('paylasim.suggestedTitle');
        aciklama = t('paylasim.suggestedBody');
        break;
      case 'gonderi_yakinda':
        baslik = t('paylasim.postSoonTitle');
        aciklama = t('paylasim.postSoonBody');
        break;
      case 'urun_kaydedildi':
        baslik = t('paylasim.productSaved', { name: sonuc.urun.title });
        aciklama = t(sonuc.butikYeni ? 'paylasim.productSavedNewBoutique' : 'paylasim.productSavedBody', {
          boutique: sonuc.butik.name,
        });
        gorsel = sonuc.urun.imageUrl ?? sonuc.butik.logoUrl ?? sonuc.butik.coverImageUrl;
        break;
      case 'butik_degil':
        baslik = t('paylasim.notBoutiqueTitle');
        aciklama = t('paylasim.notBoutiqueBody');
        break;
      case 'site_yok':
        baslik = t('paylasim.noSiteTitle');
        aciklama = t('paylasim.noSiteBody');
        break;
      default:
        baslik = t('paylasim.unknownTitle');
        aciklama = t('paylasim.unknownBody');
    }
  }
  const bekliyor = durum !== 'unauthenticated' && sonuc === null;
  const otomatikKapanir =
    sonuc !== null && sonuc !== 'hata' && ['kaydedildi', 'eklendi', 'urun_kaydedildi'].includes(sonuc.durum);

  return (
    <View style={styles.root}>
      <View style={styles.kart}>
        <Text style={styles.logo}>B U T I K A</Text>
        {gorsel ? <Image source={{ uri: gorsel }} style={styles.gorsel} contentFit="cover" /> : null}
        {bekliyor ? <ActivityIndicator color={theme.colors.ink} /> : null}
        <Text style={styles.baslik}>{baslik}</Text>
        {aciklama ? <Text style={styles.aciklama}>{aciklama}</Text> : null}
        {!bekliyor && !otomatikKapanir ? (
          <Pressable
            style={({ pressed }) => [styles.dugme, pressed && { opacity: 0.8 }]}
            onPress={durum === 'unauthenticated' ? () => router.replace('/') : kapat}
          >
            <Text style={styles.dugmeYazi}>
              {buyukHarf(t(durum === 'unauthenticated' ? 'paylasim.openApp' : 'paylasim.ok'), i18n.language)}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
    paddingBottom: 40,
    backgroundColor: 'rgba(10,10,10,0.25)',
  },
  kart: {
    backgroundColor: theme.colors.cream,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  logo: { fontFamily: theme.font.bodySemibold, fontSize: 12, color: theme.colors.bordo },
  gorsel: { width: 72, height: 72, borderRadius: 10, backgroundColor: theme.colors.mist },
  baslik: { ...theme.type.h2, color: theme.colors.ink, textAlign: 'center' },
  aciklama: {
    fontFamily: theme.font.body,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.inkMute,
    textAlign: 'center',
  },
  dugme: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.bordo,
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: 'center',
  },
  dugmeYazi: { fontFamily: theme.font.bodySemibold, fontSize: 14, color: theme.colors.cream },
});
