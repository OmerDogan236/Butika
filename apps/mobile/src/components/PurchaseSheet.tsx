import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { PostHogMaskView } from 'posthog-react-native';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { type PurchaseUpdateInput, type SavedProduct, usePurchaseUpdate } from '../api/queries';
import { buyukHarf } from '../lib/buyuk-harf';
import { useLocaleStore } from '../stores/locale';
import { theme } from '../theme';
import { CarrierCombobox } from './CarrierCombobox';

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: string;
  children: ReactNode;
}) {
  const { i18n } = useTranslation();
  return (
    <PostHogMaskView style={s.field}>
      <Text style={s.label}>
        {buyukHarf(label, i18n.language)}
        {optional ? <Text style={s.opt2}> · {optional}</Text> : null}
      </Text>
      {children}
    </PostHogMaskView>
  );
}

export function PurchaseSheet({
  product,
  onClose,
  onDone,
}: {
  product: SavedProduct | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const market = useLocaleStore((st) => st.country);
  const update = usePurchaseUpdate();

  const [order, setOrder] = useState('');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');

  useEffect(() => {
    setOrder(product?.orderNumber ?? '');
    setCarrier(product?.carrier ?? '');
    setTracking(product?.trackingNumber ?? '');
  }, [product]);

  if (!product) return null;
  const editing = !!product.purchasedAt;
  const delivered = !!product.deliveredAt;

  function run(patch: PurchaseUpdateInput, msg: string) {
    if (!product) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    update.mutate(
      { id: product.id, ...patch },
      {
        onSuccess: () => {
          onDone(msg);
          onClose();
        },
      },
    );
  }

  const fields: PurchaseUpdateInput = {
    orderNumber: order.trim() || null,
    carrier: carrier.trim() || null,
    trackingNumber: tracking.trim() || null,
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.root}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.kav}
        >
          <View style={s.sheet}>
            <View style={s.grab} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={s.prod}>
                {product.imageUrl ? (
                  <Image source={product.imageUrl} style={s.thumb} contentFit="cover" />
                ) : (
                  <View style={[s.thumb, s.thumbFallback]}>
                    <Ionicons name="image-outline" size={18} color={theme.colors.mist} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.prodTitle} numberOfLines={2}>
                    {product.title}
                  </Text>
                  <Text style={s.prodBq}>{product.boutique.name}</Text>
                </View>
              </View>

              <Text style={s.title}>
                {editing ? t('purchases.sheetTitleEdit') : t('purchases.sheetTitle')}
              </Text>
              {!editing ? <Text style={s.optNote}>{t('purchases.allOptional')}</Text> : null}

              <Field label={t('purchases.orderLabel')} optional={t('purchases.optional')}>
                <TextInput
                  value={order}
                  onChangeText={setOrder}
                  placeholder={t('purchases.orderPlaceholder')}
                  placeholderTextColor={theme.colors.inkFaint}
                  style={s.inp}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </Field>

              <Field label={t('purchases.carrierLabel')} optional={t('purchases.carrierHint')}>
                <CarrierCombobox
                  value={carrier}
                  onChange={setCarrier}
                  market={market}
                  placeholder={t('purchases.carrierPlaceholder')}
                />
              </Field>

              <Field label={t('purchases.trackingLabel')} optional={t('purchases.optional')}>
                <TextInput
                  value={tracking}
                  onChangeText={setTracking}
                  placeholder={t('purchases.trackingPlaceholder')}
                  placeholderTextColor={theme.colors.inkFaint}
                  style={s.inp}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </Field>

              <Pressable
                style={[s.primary, update.isPending && { opacity: 0.6 }]}
                disabled={update.isPending}
                onPress={() =>
                  run(
                    editing ? fields : { purchased: true, ...fields },
                    editing ? t('purchases.toastUpdated') : t('purchases.toastPurchased'),
                  )
                }
              >
                {update.isPending ? (
                  <ActivityIndicator color={theme.colors.cream} />
                ) : (
                  <Text style={s.primaryText}>
                    {buyukHarf(
                      editing ? t('purchases.saveEdit') : t('purchases.confirm'),
                      i18n.language,
                    )}{' '}
                    ✓
                  </Text>
                )}
              </Pressable>

              {!editing ? (
                <Pressable
                  onPress={() => run({ purchased: true }, t('purchases.toastPurchased'))}
                  disabled={update.isPending}
                >
                  <Text style={s.later}>{t('purchases.later')}</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    style={s.secondary}
                    disabled={update.isPending}
                    onPress={() => run({ delivered: !delivered }, t('purchases.toastUpdated'))}
                  >
                    <Ionicons
                      name={delivered ? 'cube-outline' : 'checkmark-circle-outline'}
                      size={16}
                      color={theme.colors.ink}
                    />
                    <Text style={s.secondaryText}>
                      {delivered ? t('purchases.markInTransit') : t('purchases.markDelivered')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => run({ purchased: false }, t('purchases.toastUndone'))}
                    disabled={update.isPending}
                  >
                    <Text style={s.undo}>
                      {buyukHarf(t('purchases.undoPurchase'), i18n.language)}
                    </Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,37,32,0.38)' },
  kav: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.cream,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  grab: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.mist,
    alignSelf: 'center',
    marginBottom: 14,
  },
  prod: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  thumb: { width: 46, height: 56, borderRadius: 6, backgroundColor: theme.colors.mist },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.creamSoft,
  },
  prodTitle: { fontFamily: 'Inter_500Medium', fontSize: 14, color: theme.colors.ink },
  prodBq: { ...theme.type.micro, color: theme.colors.inkFaint, marginTop: 2 },
  title: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 26,
    color: theme.colors.ink,
    marginTop: 14,
  },
  optNote: { ...theme.type.caption, color: theme.colors.inkFaint, marginTop: 2, marginBottom: 6 },
  field: { marginTop: 14 },
  label: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 1.5,
    marginBottom: 7,
  },
  opt2: { color: theme.colors.inkFaint, textTransform: 'none', letterSpacing: 0 },
  inp: {
    height: 46,
    paddingHorizontal: 13,
    backgroundColor: theme.colors.creamSoft,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: theme.colors.ink,
  },
  primary: {
    marginTop: 22,
    height: 52,
    borderRadius: 12,
    backgroundColor: theme.colors.bordo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    letterSpacing: 1.5,
    color: theme.colors.cream,
  },
  later: {
    ...theme.type.body,
    fontSize: 13,
    color: theme.colors.inkMute,
    textAlign: 'center',
    marginTop: 14,
  },
  secondary: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: theme.colors.ink },
  undo: {
    ...theme.type.micro,
    color: theme.colors.clay,
    textAlign: 'center',
    letterSpacing: 1.5,
    marginTop: 16,
  },
});
