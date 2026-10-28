import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { SavedVariant } from '../lib/saved-variant';
import { theme } from '../theme';

export function VariantPicker({
  variants,
  onSelect,
  onNotify,
  onClose,
}: {
  variants: SavedVariant[] | null;
  onSelect: (variant: SavedVariant) => void;
  /** Save a sold-out option and ask to be told when it is back in stock. */
  onNotify?: (variant: SavedVariant) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal visible={!!variants} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}>
        <View
          style={{
            backgroundColor: 'white',
            padding: 24,
            paddingBottom: 40,
            maxHeight: '75%',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{ fontSize: 20, fontWeight: '700', marginBottom: 8 }}
          >
            {t('boutique.chooseVariant')}
          </Text>
          <Text style={{ marginBottom: 16 }}>{t('boutique.variantHint')}</Text>
          <ScrollView>
            {variants?.map((variant) => (
              <View
                key={variant.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderBottomWidth: 1,
                  borderColor: '#ddd',
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onSelect(variant)}
                  style={{ flex: 1, paddingVertical: 16 }}
                >
                  <Text style={{ fontSize: 16 }}>{variant.title}</Text>
                  {variant.available === false && <OutOfStockNote />}
                  {variant.available === null && (
                    <Text style={{ color: '#666', marginTop: 4 }}>
                      {t('boutique.variantUnknownStock')}
                    </Text>
                  )}
                </Pressable>
                {variant.available === false && onNotify && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('saved.restockNotify')}
                    hitSlop={8}
                    onPress={() => onNotify(variant)}
                    style={{ paddingVertical: 16, paddingLeft: 16 }}
                  >
                    <Ionicons name="notifications-outline" size={22} color={theme.colors.gold} />
                  </Pressable>
                )}
              </View>
            ))}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ paddingTop: 20 }}>
            <Text style={{ textAlign: 'center' }}>{t('boutique.variantCancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// "Şu an tükendi. Stok gelince [Butika]'dan haber almak için zile dokun." — bildirimin
// Butika'dan geleceği, yuvarlak rozetle vurgulanır. Kelimeler ayrı parçalar ki satır doğal kırılsın.
function OutOfStockNote() {
  const { t } = useTranslation();
  const before = t('boutique.outOfStockBefore')
    .split(' ')
    .filter(Boolean)
    .map((w, i) => ({ w, id: `b${i}` }));
  const after = t('boutique.outOfStockAfter');
  // Rozetin hemen ardından gelen ek ("’dan") rozete yapışık kalmalı; boşlukla başlıyorsa ayrı.
  const glued = after.startsWith(' ') ? '' : (after.split(' ')[0] ?? '');
  const rest = (glued ? after.slice(glued.length) : after)
    .split(' ')
    .filter(Boolean)
    .map((w, i) => ({ w, id: `a${i}` }));
  const word = { color: '#666', fontSize: 14, lineHeight: 22 } as const;
  return (
    <View
      accessible
      accessibilityLabel={t('boutique.variantOutOfStock')}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        marginTop: 4,
        columnGap: 4,
      }}
    >
      {before.map(({ w, id }) => (
        <Text key={id} style={word}>
          {w}
        </Text>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            backgroundColor: theme.colors.gold,
            borderRadius: 999,
            paddingHorizontal: 9,
            paddingVertical: 2,
          }}
        >
          <Text
            style={{
              color: theme.colors.cream,
              fontSize: 13,
              lineHeight: 17,
              fontFamily: theme.font.bodySemibold,
              letterSpacing: 0.3,
            }}
          >
            {t('boutique.outOfStockBrand')}
          </Text>
        </View>
        {glued ? <Text style={word}>{glued}</Text> : null}
      </View>
      {rest.map(({ w, id }) => (
        <Text key={id} style={word}>
          {w}
        </Text>
      ))}
    </View>
  );
}
