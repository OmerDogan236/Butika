import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { PostHogMaskView } from 'posthog-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SavedProduct } from '../api/queries';
import { addedLabel } from '../lib/addedLabel';
import { buyukHarf } from '../lib/buyuk-harf';
import { buildTrackingUrl } from '../lib/carriers';
import { theme } from '../theme';

export function PurchaseCard({
  product,
  onEdit,
  onCopied,
}: {
  product: SavedProduct;
  onEdit: () => void;
  onCopied: () => void;
}) {
  const { t, i18n } = useTranslation();
  const delivered = !!product.deliveredAt;
  const tracking = product.trackingNumber?.trim();

  async function track() {
    if (!tracking) return;
    Haptics.selectionAsync();
    await WebBrowser.openBrowserAsync(buildTrackingUrl(product.carrier, tracking));
  }

  async function copyOrder() {
    if (!product.orderNumber) return;
    await Clipboard.setStringAsync(product.orderNumber);
    Haptics.selectionAsync();
    onCopied();
  }

  return (
    <Pressable style={[s.card, delivered && s.cardDelivered]} onPress={onEdit}>
      <View style={[s.pill, delivered ? s.pillDone : s.pillWay]}>
        <Text style={[s.pillText, delivered ? s.pillTextDone : s.pillTextWay]}>
          {buyukHarf(
            delivered ? t('purchases.deliveredPill') : t('purchases.inTransitPill'),
            i18n.language,
          )}
        </Text>
      </View>

      <View style={s.top}>
        {product.imageUrl ? (
          <Image source={product.imageUrl} style={s.thumb} contentFit="cover" transition={250} />
        ) : (
          <View style={[s.thumb, s.thumbFallback]}>
            <Ionicons name="image-outline" size={18} color={theme.colors.mist} />
          </View>
        )}
        <View style={s.info}>
          <Text style={s.title} numberOfLines={2}>
            {product.title}
          </Text>
          <Text style={s.bq} numberOfLines={1}>
            {product.boutique.name}
          </Text>
          {product.purchasedAt ? (
            <Text style={s.date}>{addedLabel(product.purchasedAt)}</Text>
          ) : null}
          {product.orderNumber ? (
            <PostHogMaskView>
              <Pressable style={s.order} onPress={copyOrder} hitSlop={6}>
                <Text style={s.orderText}>
                  {t('purchases.orderTag')} {product.orderNumber}
                </Text>
                <Ionicons name="copy-outline" size={12} color={theme.colors.inkFaint} />
              </Pressable>
            </PostHogMaskView>
          ) : null}
        </View>
      </View>

      {tracking ? (
        <View style={s.ship}>
          <PostHogMaskView style={s.carrierRow}>
            <View style={s.dot} />
            <Text style={s.carrierName}>{product.carrier || t('purchases.trackButton')}</Text>
            <Text style={s.trk} numberOfLines={1}>
              {tracking}
            </Text>
          </PostHogMaskView>
          <Pressable style={s.trackBtn} onPress={track}>
            <Text style={s.trackBtnText}>
              {buyukHarf(t('purchases.trackButton'), i18n.language)} →
            </Text>
          </Pressable>
        </View>
      ) : !delivered ? (
        <Pressable style={s.addShip} onPress={onEdit}>
          <Ionicons name="add" size={15} color={theme.colors.gold} />
          <Text style={s.addShipText}>{t('purchases.addShipping')}</Text>
        </Pressable>
      ) : null}
    </Pressable>
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
  cardDelivered: { opacity: 0.78 },
  pill: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    zIndex: 1,
  },
  pillWay: { backgroundColor: `${theme.colors.gold}22` },
  pillDone: { backgroundColor: `${theme.colors.sage}28` },
  pillText: { ...theme.type.micro, fontSize: 9.5, letterSpacing: 1 },
  pillTextWay: { color: theme.colors.gold },
  pillTextDone: { color: theme.colors.sage },
  top: { flexDirection: 'row', gap: 12 },
  thumb: { width: 62, height: 78, borderRadius: 7, backgroundColor: theme.colors.mist },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.creamSoft,
  },
  info: { flex: 1, paddingRight: 52 },
  title: { fontFamily: 'Inter_500Medium', fontSize: 13.5, color: theme.colors.ink, lineHeight: 18 },
  bq: { ...theme.type.micro, color: theme.colors.inkMute, marginTop: 3 },
  date: { ...theme.type.micro, color: theme.colors.inkFaint, marginTop: 3, letterSpacing: 0.5 },
  order: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: theme.colors.creamSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
  },
  orderText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.colors.inkMute },
  ship: {
    marginTop: 11,
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
  },
  carrierRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.gold },
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
  addShip: {
    marginTop: 11,
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addShipText: { fontFamily: 'Inter_500Medium', fontSize: 12.5, color: theme.colors.gold },
});
