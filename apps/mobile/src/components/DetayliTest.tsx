import {
  BEDENLER,
  BEDEN_ETIKETLERI,
  BEDEN_SINIRI,
  BOS_DETAYLI_CEVAP,
  BUYUK_BEDEN_ETIKETI,
  COCUK_CINSIYETLERI,
  COCUK_CINSIYET_ETIKETLERI,
  COCUK_CINSIYET_SORUSU,
  COCUK_VAR_ETIKETLERI,
  COCUK_YASLARI,
  COCUK_YAS_ETIKETLERI,
  COCUK_YAS_SORUSU,
  DEGERLER,
  DEGER_ETIKETLERI,
  DETAYLI_ADIMLAR,
  DETAYLI_RENKLER,
  DETAYLI_RENK_ETIKETLERI,
  DETAYLI_SORULAR,
  DETAYLI_TEST_SURUMU,
  DETAYLI_URUNLER,
  DETAYLI_URUN_ETIKETLERI,
  DURUMLAR,
  DURUM_ETIKETLERI,
  DURUM_SINIRI,
  type DetayliAdim,
  type DetayliTestCevaplari,
  HAMILE_CEVAPLARI,
  HAMILE_ETIKETLERI,
  KUMASLAR,
  KUMAS_ETIKETLERI,
  RENK_SINIRI,
  TESETTUR_CEVAPLARI,
  TESETTUR_ETIKETLERI,
} from '@butika/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { PostHogMaskView } from 'posthog-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useDetayliTest, useDetayliTestKaydet } from '../api/detayli-test';
import { useUpdateProfile } from '../api/queries';
import { captureEvent } from '../lib/analytics';
import { buyukHarf } from '../lib/buyuk-harf';
import { adimDolu, adimiBosalt, degistir } from '../lib/detayli-test';
import { useAuthStore } from '../stores/auth';
import { theme } from '../theme';
import { TestSecenegi } from './TestSecenegi';

// Detaylı test (9 adım). Her adım "Geç" ile boş bırakılabilir; hepsi geçilse de kaydedilir.
// Tasarım: docs/superpowers/specs/2026-10-16-detayli-test-tasarim.md (§2)

export type DetayliKaynak = 'vitrin_afisi' | 'ayarlar';

export function DetayliTest({ kaynak, onBitti }: { kaynak: DetayliKaynak; onBitti: () => void }) {
  const { t, i18n } = useTranslation();
  const son = useDetayliTest();
  const kaydet = useDetayliTestKaydet();
  const [adimNo, setAdimNo] = useState(0);
  const [cevap, setCevap] = useState<DetayliTestCevaplari>(BOS_DETAYLI_CEVAP);
  const [bitti, setBitti] = useState(false);
  const [hata, setHata] = useState(false);
  const dokunuldu = useRef(false);
  // Boy-kilo (1.2.4'te girişten buraya taşındı): beden adımında, isteğe bağlı; profile yazılır.
  const kullanici = useAuthStore((s) => s.user);
  const profilGuncelle = useUpdateProfile();
  const [boy, setBoy] = useState(kullanici?.heightCm ? String(kullanici.heightCm) : '');
  const [kilo, setKilo] = useState(kullanici?.weightKg ? String(kullanici.weightKg) : '');
  function olculeriKaydet() {
    const h = Number.parseInt(boy, 10);
    const w = Number.parseInt(kilo, 10);
    const govde: { heightCm?: number; weightKg?: number } = {};
    if (!Number.isNaN(h) && h >= 100 && h <= 250 && h !== kullanici?.heightCm) govde.heightCm = h;
    if (!Number.isNaN(w) && w >= 30 && w <= 300 && w !== kullanici?.weightKg) govde.weightKg = w;
    if (Object.keys(govde).length > 0) profilGuncelle.mutate(govde);
  }

  useEffect(() => {
    captureEvent('detayli_test_basladi', { kaynak });
  }, [kaynak]);

  // Önceki cevaplar dolu gelir — kullanıcı henüz bir şeye dokunmadıysa.
  useEffect(() => {
    if (son.data && !dokunuldu.current) setCevap(son.data.cevaplar);
  }, [son.data]);

  function guncelle(f: (c: DetayliTestCevaplari) => DetayliTestCevaplari) {
    dokunuldu.current = true;
    setHata(false);
    setCevap(f);
  }

  const toplam = DETAYLI_ADIMLAR.length;
  const adim: DetayliAdim = DETAYLI_ADIMLAR[adimNo] ?? 'cocuk';
  const secimVar = adimDolu(cevap, adim);
  const sonAdim = adimNo === toplam - 1;

  function ilerle(atlandi: boolean) {
    if (kaydet.isPending) return;
    if (!atlandi && !secimVar) return;
    Haptics.selectionAsync();
    if (adim === 'beden') olculeriKaydet();
    const yeni = atlandi ? adimiBosalt(cevap, adim) : cevap;
    if (atlandi) guncelle(() => yeni);
    if (!sonAdim) {
      setAdimNo(adimNo + 1);
      return;
    }
    kaydet.mutate(
      { testSurumu: DETAYLI_TEST_SURUMU, cevaplar: yeni },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          captureEvent('detayli_test_tamamlandi', { kaynak });
          setBitti(true);
        },
        onError: () => setHata(true),
      },
    );
  }

  if (bitti) {
    return (
      <View style={[styles.root, styles.sonucRoot]}>
        <View style={styles.sonucOrta}>
          <Text style={styles.sonucBaslik}>{t('detayliTest.bittiBaslik')}</Text>
          <Text style={styles.sonucMetin}>{t('detayliTest.bittiMetin')}</Text>
        </View>
        <Pressable
          onPress={onBitti}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.ctaLabel}>{t('detayliTest.devam')}</Text>
        </Pressable>
      </View>
    );
  }

  const tek = <K extends string>(
    degerler: readonly K[],
    etiket: Record<K, string>,
    secili: K | null,
    sec: (v: K | null) => void,
  ) =>
    degerler.map((v) => (
      <TestSecenegi
        key={v}
        etiket={etiket[v]}
        tekSecim
        secili={secili === v}
        onPress={() => sec(secili === v ? null : v)}
      />
    ));

  const coklu = <K extends string>(
    degerler: readonly K[],
    etiket: Record<K, string>,
    secili: K[],
    sec: (v: K[]) => void,
    sinir?: number,
  ) =>
    degerler.map((v) => (
      <TestSecenegi
        key={v}
        etiket={etiket[v]}
        secili={secili.includes(v)}
        onPress={() => sec(degistir(secili, v, sinir))}
      />
    ));

  const ipucu = (() => {
    if (adim === 'durumlar') return t('detayliTest.enFazla', { count: DURUM_SINIRI });
    if (adim === 'beden') return t('detayliTest.enFazla', { count: BEDEN_SINIRI });
    if (adim === 'renkler') return t('detayliTest.enFazla', { count: RENK_SINIRI });
    if (adim === 'urunler' || adim === 'degerler') return t('detayliTest.cokluSecim');
    return t('detayliTest.tekSecim');
  })();

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {adimNo > 0 ? (
          <Pressable
            onPress={() => setAdimNo(adimNo - 1)}
            hitSlop={12}
            accessibilityLabel={t('detayliTest.geriA11y')}
          >
            <Ionicons name="chevron-back" size={26} color={theme.colors.ink} />
          </Pressable>
        ) : (
          <View style={{ width: 26 }} />
        )}
        <Text style={styles.kicker}>
          {buyukHarf(
            `${t('detayliTest.kicker')} · ${t('detayliTest.ilerleme', { adim: adimNo + 1, toplam })}`,
            i18n.language,
          )}
        </Text>
        <View style={{ width: 26 }} />
      </View>
      <View style={styles.progress}>
        <View style={[styles.progressFill, { width: `${((adimNo + 1) / toplam) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.soru}>{DETAYLI_SORULAR[adim]}</Text>
        <Text style={styles.ipucu}>{ipucu}</Text>

        {adim === 'cocuk' ? (
          <>
            {tek(
              ['yok', 'var'] as const,
              COCUK_VAR_ETIKETLERI,
              cevap.cocuk ? (cevap.cocuk.var ? 'var' : 'yok') : null,
              (v) =>
                guncelle((c) => ({
                  ...c,
                  cocuk: v === null ? null : { var: v === 'var', yaslar: [], cinsiyet: null },
                })),
            )}
            {cevap.cocuk?.var ? (
              <>
                <Text style={styles.altSoru}>{COCUK_YAS_SORUSU}</Text>
                {coklu(COCUK_YASLARI, COCUK_YAS_ETIKETLERI, cevap.cocuk.yaslar, (yaslar) =>
                  guncelle((c) => (c.cocuk ? { ...c, cocuk: { ...c.cocuk, yaslar } } : c)),
                )}
                <Text style={styles.altSoru}>{COCUK_CINSIYET_SORUSU}</Text>
                {tek(
                  COCUK_CINSIYETLERI,
                  COCUK_CINSIYET_ETIKETLERI,
                  cevap.cocuk.cinsiyet,
                  (cinsiyet) =>
                    guncelle((c) => (c.cocuk ? { ...c, cocuk: { ...c.cocuk, cinsiyet } } : c)),
                )}
              </>
            ) : null}
          </>
        ) : null}

        {adim === 'tesettur'
          ? tek(TESETTUR_CEVAPLARI, TESETTUR_ETIKETLERI, cevap.tesettur, (v) =>
              guncelle((c) => ({ ...c, tesettur: v })),
            )
          : null}
        {adim === 'hamile'
          ? tek(HAMILE_CEVAPLARI, HAMILE_ETIKETLERI, cevap.hamile, (v) =>
              guncelle((c) => ({ ...c, hamile: v })),
            )
          : null}
        {adim === 'durumlar'
          ? coklu(
              DURUMLAR,
              DURUM_ETIKETLERI,
              cevap.durumlar,
              (v) => guncelle((c) => ({ ...c, durumlar: v })),
              DURUM_SINIRI,
            )
          : null}
        {adim === 'urunler'
          ? coklu(DETAYLI_URUNLER, DETAYLI_URUN_ETIKETLERI, cevap.urunler, (v) =>
              guncelle((c) => ({ ...c, urunler: v })),
            )
          : null}
        {adim === 'beden' ? (
          <>
            {coklu(
              BEDENLER,
              BEDEN_ETIKETLERI,
              cevap.bedenler,
              (v) => guncelle((c) => ({ ...c, bedenler: v })),
              BEDEN_SINIRI,
            )}
            <TestSecenegi
              etiket={BUYUK_BEDEN_ETIKETI}
              vurgulu
              secili={cevap.buyukBeden}
              onPress={() => guncelle((c) => ({ ...c, buyukBeden: !c.buyukBeden }))}
            />
            <Text style={styles.altSoru}>{t('detayliTest.olculerSorusu')}</Text>
            <Text style={styles.ipucu}>{t('detayliTest.olculerIpucu')}</Text>
            <View style={styles.olculer}>
              {[
                { deger: boy, ayarla: setBoy, birim: 'cm', etiket: t('detayliTest.boy') },
                { deger: kilo, ayarla: setKilo, birim: 'kg', etiket: t('detayliTest.kilo') },
              ].map((o) => (
                <View key={o.birim} style={styles.olcu}>
                  {/* Boy-kilo oturum kaydına girmesin (eski onboarding'deki gibi maskeli). */}
                  <PostHogMaskView style={styles.olcuKutu}>
                    <TextInput
                      value={o.deger}
                      onChangeText={(v) => o.ayarla(v.replace(/[^0-9]/g, '').slice(0, 3))}
                      keyboardType="number-pad"
                      placeholder={o.birim === 'cm' ? '170' : '60'}
                      placeholderTextColor={theme.colors.inkFaint}
                      style={styles.olcuGirdi}
                      accessibilityLabel={o.etiket}
                    />
                    <Text style={styles.olcuBirim}>{o.birim}</Text>
                  </PostHogMaskView>
                  <Text style={styles.olcuEtiket}>{buyukHarf(o.etiket, i18n.language)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
        {adim === 'renkler'
          ? coklu(
              DETAYLI_RENKLER,
              DETAYLI_RENK_ETIKETLERI,
              cevap.renkler,
              (v) => guncelle((c) => ({ ...c, renkler: v })),
              RENK_SINIRI,
            )
          : null}
        {adim === 'kumas'
          ? tek(KUMASLAR, KUMAS_ETIKETLERI, cevap.kumas, (v) =>
              guncelle((c) => ({ ...c, kumas: v })),
            )
          : null}
        {adim === 'degerler'
          ? coklu(DEGERLER, DEGER_ETIKETLERI, cevap.degerler, (v) =>
              guncelle((c) => ({ ...c, degerler: v })),
            )
          : null}
      </ScrollView>

      <View style={styles.footer}>
        {hata ? <Text style={styles.hata}>{t('detayliTest.hata')}</Text> : null}
        <Pressable
          onPress={() => ilerle(false)}
          disabled={!secimVar || kaydet.isPending}
          style={({ pressed }) => [
            styles.cta,
            !secimVar && styles.ctaPasif,
            pressed && { opacity: 0.8 },
          ]}
        >
          {kaydet.isPending ? (
            <ActivityIndicator color={theme.colors.cream} />
          ) : (
            <Text style={styles.ctaLabel}>
              {sonAdim ? t('detayliTest.bitir') : t('detayliTest.devam')}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => ilerle(true)}
          disabled={kaydet.isPending}
          hitSlop={8}
          style={({ pressed }) => [styles.ikincil, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.ikincilLabel}>{t('detayliTest.gec')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
  },
  kicker: { ...theme.type.micro, color: theme.colors.inkMute, letterSpacing: 3 },
  progress: { height: 2, marginHorizontal: 24, backgroundColor: theme.colors.mist },
  progressFill: { height: 2, backgroundColor: theme.colors.gold },
  content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, gap: 10 },
  soru: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 28,
    lineHeight: 34,
    color: theme.colors.ink,
  },
  olculer: { flexDirection: 'row', gap: 16 },
  olcu: { flex: 1, gap: 6 },
  olcuKutu: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.mist,
    paddingBottom: 6,
  },
  olcuGirdi: {
    flex: 1,
    paddingVertical: 0,
    fontFamily: 'Newsreader_400Regular',
    fontSize: 32,
    color: theme.colors.ink,
  },
  olcuBirim: { ...theme.type.caption, color: theme.colors.inkMute },
  olcuEtiket: { ...theme.type.micro, color: theme.colors.inkMute, letterSpacing: 2 },
  altSoru: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 20,
    lineHeight: 26,
    color: theme.colors.ink,
    marginTop: 18,
  },
  ipucu: { ...theme.type.caption, color: theme.colors.inkFaint, marginBottom: 10 },
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16, gap: 4 },
  hata: { ...theme.type.caption, color: theme.colors.bordo, textAlign: 'center', marginBottom: 6 },
  cta: {
    height: 54,
    borderRadius: 8,
    backgroundColor: theme.colors.bordo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPasif: { opacity: 0.3 },
  ctaLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: theme.colors.cream,
    letterSpacing: 0.4,
  },
  ikincil: { alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  ikincilLabel: { fontFamily: 'Inter_500Medium', fontSize: 14, color: theme.colors.inkMute },
  sonucRoot: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 16 },
  sonucOrta: { flex: 1, justifyContent: 'center', gap: 12 },
  sonucBaslik: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 40,
    lineHeight: 46,
    color: theme.colors.ink,
  },
  sonucMetin: { ...theme.type.body, color: theme.colors.inkMute },
});
