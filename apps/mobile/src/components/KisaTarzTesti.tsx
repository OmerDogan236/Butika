import {
  FIYAT_ETIKETLERI,
  FIYAT_SEGMENTLERI,
  FIYAT_SORUSU,
  HEPSI,
  KISA_SENARYO,
  SENARYO_SORULARI,
  type SonTarzTesti,
  TARZLAR,
  TARZ_ACIKLAMALARI,
  TARZ_SORUSU,
  TEST_SURUMU_KISA,
  YAS_ARALIKLARI,
  YAS_ETIKETLERI,
  YAS_SORUSU,
} from '@butika/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { trackEvents } from '../api/queries';
import { useSonTarzTesti, useTarzTestiGonder } from '../api/tarz-testi';
import { captureEvent } from '../lib/analytics';
import { buyukHarf } from '../lib/buyuk-harf';
import {
  KISA_ADIM_SAYISI,
  type KisaCevap,
  type TestKaynagi,
  atlananAdimSayisi,
  bosCevap,
  gonderimeCevir,
} from '../lib/kisa-test';
import { theme } from '../theme';
import { TestSecenegi } from './TestSecenegi';

// Kısa tarz testi (4 adım: kahvaltı → tarz → fiyat → yaş). Her adım atlanabilir.
// Ekran değil: onboarding, /tarz-testi ve kişisel akış kendi güvenli alanı içinde gösterir.
// Tasarım: docs/superpowers/specs/2026-10-01-kisisel-butika-tasarim.md (§1, §4, §8)

const TARZ_SINIRI = 3;
const KAHVALTI = SENARYO_SORULARI.find((s) => s.anahtar === KISA_SENARYO);

type Adim = 'kahvalti' | 'tarz' | 'fiyat' | 'yas';
const ADIMLAR: Adim[] = ['kahvalti', 'tarz', 'fiyat', 'yas'];

function degistir<T>(liste: T[], deger: T, sinir = Number.POSITIVE_INFINITY): T[] {
  if (liste.includes(deger)) return liste.filter((x) => x !== deger);
  return liste.length >= sinir ? liste : [...liste, deger];
}

function adimDolu(c: KisaCevap, adim: Adim): boolean {
  switch (adim) {
    case 'kahvalti':
      return c.kahvalti.length > 0;
    case 'tarz':
      return c.acikTarzlar.length > 0;
    case 'fiyat':
      return c.fiyatSegmentleri.length > 0;
    case 'yas':
      return c.yasAraligi !== null;
  }
}

function adimiBosalt(c: KisaCevap, adim: Adim): KisaCevap {
  switch (adim) {
    case 'kahvalti':
      return { ...c, kahvalti: [] };
    case 'tarz':
      return { ...c, acikTarzlar: [] };
    case 'fiyat':
      return { ...c, fiyatSegmentleri: [] };
    case 'yas':
      return { ...c, yasAraligi: null };
  }
}

export interface KisaTarzTestiProps {
  kaynak: TestKaynagi;
  onBitti: (sonuc: SonTarzTesti | null) => void;
  /** Güncelleme akışında "Daha sonra" gibi ikincil çıkış. */
  altEylem?: { etiket: string; onPress: () => void };
}

export function KisaTarzTesti({ kaynak, onBitti, altEylem }: KisaTarzTestiProps) {
  const { t, i18n } = useTranslation();
  const son = useSonTarzTesti();
  const gonder = useTarzTestiGonder();
  const [adimNo, setAdimNo] = useState(0);
  const [cevap, setCevap] = useState<KisaCevap>(bosCevap);
  const [sonuc, setSonuc] = useState<SonTarzTesti | null>(null);
  const dokunuldu = useRef(false);

  useEffect(() => {
    trackEvents([
      { type: 'tarz_testi_basladi', payload: { testSurumu: TEST_SURUMU_KISA, kaynak } },
    ]);
  }, [kaynak]);

  // Önceki kısa test cevabı varsa seçili gelir — kullanıcı henüz bir şeye dokunmadıysa.
  useEffect(() => {
    const s = son.data;
    if (!s || s.testSurumu !== TEST_SURUMU_KISA || dokunuldu.current) return;
    setCevap({
      kahvalti: s.senaryo[KISA_SENARYO] ?? [],
      acikTarzlar: s.acikTarzlar,
      fiyatSegmentleri: s.fiyatSegmentleri,
      yasAraligi: s.yasAraligi ?? null,
    });
  }, [son.data]);

  function guncelle(f: (c: KisaCevap) => KisaCevap) {
    dokunuldu.current = true;
    setCevap(f);
  }

  const adim: Adim = ADIMLAR[adimNo] ?? 'kahvalti';
  const secimVar = adimDolu(cevap, adim);
  const sonAdim = adimNo === KISA_ADIM_SAYISI - 1;

  function bitir(sonCevap: KisaCevap) {
    const gonderim = gonderimeCevir(sonCevap);
    if (!gonderim) {
      captureEvent('tarz_testi_atlandi', { kaynak });
      onBitti(null);
      return;
    }
    gonder.mutate(gonderim, {
      onSuccess: (s) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        captureEvent('tarz_testi_tamamlandi', { kaynak, atlanan: atlananAdimSayisi(sonCevap) });
        setSonuc(s);
      },
      // Cevabı telefonda saklamak useTarzTestiGonder'in onError'unda (ekran kapansa da çalışır).
      onError: () => onBitti(null),
    });
  }

  function ilerle(atlandi: boolean) {
    if (gonder.isPending) return;
    if (!atlandi && !secimVar) return;
    Haptics.selectionAsync();
    const yeni = atlandi ? adimiBosalt(cevap, adim) : cevap;
    if (atlandi) guncelle(() => yeni);
    trackEvents([
      {
        type: 'tarz_testi_adim',
        payload: { testSurumu: TEST_SURUMU_KISA, kaynak, adim: adimNo + 1, atlandi },
      },
    ]);
    if (sonAdim) bitir(yeni);
    else setAdimNo(adimNo + 1);
  }

  if (sonuc) {
    const tarzlar = [sonuc.tarz1, sonuc.tarz2].filter(Boolean).join(' · ');
    return (
      <View style={[styles.root, styles.sonucRoot]}>
        <View style={styles.sonucOrta}>
          <Text style={styles.sonucBaslik}>{t('tarzTesti.hazirBaslik')}</Text>
          {tarzlar ? (
            <Text style={styles.sonucTarz}>{t('tarzTesti.hazirTarz', { tarzlar })}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => onBitti(sonuc)}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.ctaLabel}>{t('tarzTesti.devam')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {adimNo > 0 ? (
          <Pressable
            onPress={() => setAdimNo(adimNo - 1)}
            hitSlop={12}
            accessibilityLabel={t('tarzTesti.geriA11y')}
          >
            <Ionicons name="chevron-back" size={26} color={theme.colors.ink} />
          </Pressable>
        ) : (
          <View style={{ width: 26 }} />
        )}
        <Text style={styles.kicker}>
          {buyukHarf(
            `${t('tarzTesti.kicker')} · ${t('tarzTesti.kisaIlerleme', { adim: adimNo + 1 })}`,
            i18n.language,
          )}
        </Text>
        <View style={{ width: 26 }} />
      </View>
      <View style={styles.progress}>
        <View
          style={[styles.progressFill, { width: `${((adimNo + 1) / KISA_ADIM_SAYISI) * 100}%` }]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {adim === 'kahvalti' && KAHVALTI ? (
          <>
            <Text style={styles.soru}>{KAHVALTI.soru}</Text>
            <Text style={styles.ipucu}>{t('tarzTesti.cokluSecim')}</Text>
            {KAHVALTI.siklar.map((s) => (
              <TestSecenegi
                key={s.anahtar}
                etiket={s.etiket}
                vurgulu={s.anahtar === HEPSI}
                secili={cevap.kahvalti.includes(s.anahtar)}
                onPress={() =>
                  guncelle((c) => ({ ...c, kahvalti: degistir(c.kahvalti, s.anahtar) }))
                }
              />
            ))}
          </>
        ) : adim === 'tarz' ? (
          <>
            <Text style={styles.soru}>{TARZ_SORUSU}</Text>
            <Text style={styles.ipucu}>{t('tarzTesti.enFazla', { count: TARZ_SINIRI })}</Text>
            {TARZLAR.map((tarz) => (
              <TestSecenegi
                key={tarz}
                etiket={tarz}
                aciklama={TARZ_ACIKLAMALARI[tarz]}
                secili={cevap.acikTarzlar.includes(tarz)}
                onPress={() =>
                  guncelle((c) => ({
                    ...c,
                    acikTarzlar: degistir(c.acikTarzlar, tarz, TARZ_SINIRI),
                  }))
                }
              />
            ))}
          </>
        ) : adim === 'fiyat' ? (
          <>
            <Text style={styles.soru}>{FIYAT_SORUSU}</Text>
            <Text style={styles.ipucu}>{t('tarzTesti.cokluSecim')}</Text>
            {FIYAT_SEGMENTLERI.map((f) => (
              <TestSecenegi
                key={f}
                etiket={FIYAT_ETIKETLERI[f]}
                secili={cevap.fiyatSegmentleri.includes(f)}
                onPress={() =>
                  guncelle((c) => ({ ...c, fiyatSegmentleri: degistir(c.fiyatSegmentleri, f) }))
                }
              />
            ))}
          </>
        ) : (
          <>
            <Text style={styles.soru}>{YAS_SORUSU}</Text>
            <Text style={styles.ipucu}>{t('tarzTesti.tekSecim')}</Text>
            {YAS_ARALIKLARI.map((y) => (
              <TestSecenegi
                key={y}
                etiket={YAS_ETIKETLERI[y]}
                tekSecim
                secili={cevap.yasAraligi === y}
                onPress={() =>
                  guncelle((c) => ({ ...c, yasAraligi: c.yasAraligi === y ? null : y }))
                }
              />
            ))}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => ilerle(false)}
          disabled={!secimVar || gonder.isPending}
          style={({ pressed }) => [
            styles.cta,
            !secimVar && styles.ctaPasif,
            pressed && { opacity: 0.8 },
          ]}
        >
          {gonder.isPending ? (
            <ActivityIndicator color={theme.colors.cream} />
          ) : (
            <Text style={styles.ctaLabel}>
              {sonAdim ? t('tarzTesti.bitir') : t('tarzTesti.devam')}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => ilerle(true)}
          disabled={gonder.isPending}
          hitSlop={8}
          style={({ pressed }) => [styles.ikincil, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.ikincilLabel}>{t('tarzTesti.atla')}</Text>
        </Pressable>
        {altEylem ? (
          <Pressable
            onPress={altEylem.onPress}
            disabled={gonder.isPending}
            hitSlop={8}
            style={({ pressed }) => [styles.ikincil, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.altEylemLabel}>{altEylem.etiket}</Text>
          </Pressable>
        ) : null}
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
  kicker: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 3,
  },
  progress: { height: 2, marginHorizontal: 24, backgroundColor: theme.colors.mist },
  progressFill: { height: 2, backgroundColor: theme.colors.gold },
  content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, gap: 10 },
  soru: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 28,
    lineHeight: 34,
    color: theme.colors.ink,
  },
  ipucu: { ...theme.type.caption, color: theme.colors.inkFaint, marginBottom: 10 },
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16, gap: 4 },
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
  altEylemLabel: { ...theme.type.caption, color: theme.colors.inkFaint },
  sonucRoot: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 16 },
  sonucOrta: { flex: 1, justifyContent: 'center', gap: 12 },
  sonucBaslik: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 40,
    lineHeight: 46,
    color: theme.colors.ink,
  },
  sonucTarz: { fontFamily: 'Inter_500Medium', fontSize: 17, color: theme.colors.inkMute },
});
