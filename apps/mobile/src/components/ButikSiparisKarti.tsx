import type { ButikSiparisi } from '@butika/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { buyukHarf } from '../lib/buyuk-harf';
import { kargoTakipAdresi } from '../lib/carriers';
import { webviewRoute } from '../lib/route-text';
import { theme } from '../theme';

// Butikten okunan adresler yalnız http/https ise açılır.
const webAdresiMi = (url: string) => /^https?:\/\//i.test(url.trim());

const DURUM_RENGI: Record<ButikSiparisi['durum'], string> = {
  odenmedi: theme.colors.inkFaint,
  hazirlaniyor: theme.colors.gold,
  kargoda: theme.colors.gold,
  teslim: theme.colors.sage,
  iptal: theme.colors.clay,
};

/** Bağlı butikten otomatik okunan bir sipariş (Satın Aldıklarım; Trendyol "Siparişlerim" gibi). */
export function ButikSiparisKarti({ siparis }: { siparis: ButikSiparisi }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const takipAdresi = kargoTakipAdresi(siparis.takipUrl, siparis.kargoFirmasi, siparis.takipNo);
  const takipNo = siparis.takipNo?.trim();
  const renk = DURUM_RENGI[siparis.durum];
  const tarih = new Date(siparis.siparisAt).toLocaleDateString(
    i18n.language.startsWith('tr') ? 'tr-TR' : i18n.language,
    { day: 'numeric', month: 'long', year: 'numeric' },
  );

  function butikteAc(url: string) {
    if (!webAdresiMi(url)) return;
    Haptics.selectionAsync();
    router.push(webviewRoute({ boutiqueId: siparis.boutiqueId, url, name: siparis.butikAdi }));
  }

  async function kargoyuAc() {
    if (!takipAdresi) return;
    Haptics.selectionAsync();
    await WebBrowser.openBrowserAsync(takipAdresi);
  }

  return (
    <View style={[s.card, siparis.durum === 'iptal' && s.cardSoluk]}>
      <View style={s.head}>
        <View style={s.headInfo}>
          <Text style={s.bq} numberOfLines={1}>
            {siparis.butikAdi}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {t('purchases.otoOrderNo', { no: siparis.siparisNo })} · {tarih}
          </Text>
        </View>
        <View style={[s.pill, { backgroundColor: `${renk}22` }]}>
          <Text style={[s.pillText, { color: renk }]}>
            {buyukHarf(t(`purchases.otoDurum.${siparis.durum}`), i18n.language)}
          </Text>
        </View>
      </View>

      {siparis.satirlar.map((satir, i) => {
        const urunUrl = satir.urunUrl && webAdresiMi(satir.urunUrl) ? satir.urunUrl : null;
        return (
          <Pressable
            // biome-ignore lint/suspicious/noArrayIndexKey: satırların kimliği yok, sıra sabit
            key={i}
            style={({ pressed }) => [s.line, pressed && urunUrl ? { opacity: 0.6 } : null]}
            onPress={urunUrl ? () => butikteAc(urunUrl) : undefined}
            disabled={!urunUrl}
          >
            {satir.gorsel ? (
              <Image source={satir.gorsel} style={s.thumb} contentFit="cover" transition={250} />
            ) : (
              <View style={[s.thumb, s.thumbFallback]}>
                <Ionicons name="image-outline" size={16} color={theme.colors.mist} />
              </View>
            )}
            <Text style={s.lineName} numberOfLines={2}>
              {satir.ad}
              <Text style={s.lineQty}> × {satir.adet}</Text>
            </Text>
            {urunUrl ? (
              <Ionicons name="chevron-forward" size={15} color={theme.colors.inkFaint} />
            ) : null}
          </Pressable>
        );
      })}

      {siparis.kargoFirmasi || takipNo || takipAdresi ? (
        <View style={s.ship}>
          <View style={s.carrierRow}>
            <View style={[s.dot, { backgroundColor: renk }]} />
            <Text style={s.carrierName}>{siparis.kargoFirmasi || t('purchases.carrierLabel')}</Text>
            {takipNo ? (
              <Text style={s.trk} numberOfLines={1}>
                {takipNo}
              </Text>
            ) : null}
          </View>
          {takipAdresi ? (
            <Pressable style={s.trackBtn} onPress={kargoyuAc}>
              <Text style={s.trackBtnText}>
                {buyukHarf(t('purchases.otoKargomNerede'), i18n.language)} →
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {siparis.iadePolitikasi ? (
        <Text style={s.iade}>{t('purchases.otoIade', { metin: siparis.iadePolitikasi })}</Text>
      ) : null}

      {webAdresiMi(siparis.butikUrl) ? (
        <Pressable style={s.yaz} onPress={() => butikteAc(siparis.butikUrl)} hitSlop={6}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={theme.colors.gold} />
          <Text style={s.yazText}>{t('purchases.otoButigeYaz')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    borderRadius: 14,
    backgroundColor: theme.colors.cream,
    padding: 13,
    marginBottom: 14,
  },
  cardSoluk: { opacity: 0.78 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  headInfo: { flex: 1 },
  bq: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5, color: theme.colors.ink },
  meta: { ...theme.type.micro, color: theme.colors.inkFaint, marginTop: 3, letterSpacing: 0.5 },
  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  pillText: { ...theme.type.micro, fontSize: 9.5, letterSpacing: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10 },
  thumb: { width: 46, height: 46, borderRadius: 7, backgroundColor: theme.colors.mist },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.creamSoft,
  },
  lineName: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: theme.colors.ink,
    lineHeight: 18,
  },
  lineQty: { fontFamily: 'Inter_400Regular', color: theme.colors.inkMute },
  ship: {
    marginTop: 11,
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
  },
  carrierRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  carrierName: { fontFamily: 'Inter_500Medium', fontSize: 12.5, color: theme.colors.ink },
  trk: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: theme.colors.inkMute,
    textAlign: 'right',
  },
  trackBtn: {
    marginTop: 9,
    height: 40,
    borderRadius: 9,
    backgroundColor: theme.colors.bordo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
    color: theme.colors.cream,
  },
  iade: {
    marginTop: 11,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.inkMute,
  },
  yaz: {
    marginTop: 11,
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  yazText: { fontFamily: 'Inter_500Medium', fontSize: 12.5, color: theme.colors.gold },
});
