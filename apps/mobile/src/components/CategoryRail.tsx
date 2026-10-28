import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Category } from '../api/queries';
import { buyukHarf } from '../lib/buyuk-harf';
import { type RafGrupAnahtari, rafGruplari } from '../lib/category-rail';
import { theme } from '../theme';

interface CategoryRailProps {
  categories: Category[];
  activeId: string | null;
  onChange: (id: string) => void;
  /** Onboarding'de seçilenler — rafın en üstünde, seçim sırasıyla. */
  pinnedIds?: string[];
  /** Opsiyonel; boşsa "Popüler" grubu hiç render edilmez. */
  popularIds?: string[];
  /** Verilirse başlıkta kapatma oku görünür. */
  onCollapse?: () => void;
  /** İçeriğin sonuna eklenecek boşluk: vitrinde üst blok açıkken rafın altı ekran dışında kalır. */
  altBosluk?: number;
}

const RAF_ALT_BOSLUK = 96;

const GRUP_BASLIK: Record<RafGrupAnahtari, string> = {
  secilen: 'showcase.railPinned',
  populer: 'showcase.railPopular',
  tumu: 'showcase.railAll',
};

/**
 * Vitrinin sol kategori rafı. Satırlarda yalnız isim var: ikon, görsel ya da
 * butik sayısı yok. Seçim dokunmayla olur; satır yüksekliği 37px olduğu için
 * dokunma alanı `hitSlop` ile 44px'e tamamlanır.
 */
export function CategoryRail({
  categories,
  activeId,
  onChange,
  pinnedIds = [],
  popularIds = [],
  onCollapse,
  altBosluk = 0,
}: CategoryRailProps) {
  const { t, i18n } = useTranslation();
  const adlar = new Map(categories.map((c) => [c.id, c.name.trim()]));
  const gruplar = rafGruplari(categories, pinnedIds, popularIds);
  // Tek grup varsa (seçim ve popüler yoksa) başlık göstermeye gerek yok.
  const baslikGoster = gruplar.length > 1;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{buyukHarf(t('showcase.railTitle'), i18n.language)}</Text>
        {onCollapse ? (
          <Pressable
            onPress={onCollapse}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('showcase.railCollapse')}
            style={({ pressed }) => [styles.collapseBtn, pressed && { opacity: 0.5 }]}
          >
            <Ionicons name="chevron-back" size={16} color={theme.colors.inkMute} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          altBosluk > 0 && { paddingBottom: RAF_ALT_BOSLUK + altBosluk },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {gruplar.map((grup) => (
          <View key={grup.anahtar}>
            {baslikGoster ? (
              <View style={styles.groupTitleWrap}>
                <Text style={styles.groupTitle}>
                  {buyukHarf(t(GRUP_BASLIK[grup.anahtar]), i18n.language)}
                </Text>
              </View>
            ) : null}
            {grup.idler.map((id) => {
              const active = id === activeId;
              return (
                <Pressable
                  key={id}
                  onPress={() => onChange(id)}
                  hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.row,
                    active && styles.rowActive,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    numberOfLines={2}
                    style={[styles.label, active ? styles.labelActive : styles.labelInactive]}
                  >
                    {adlar.get(id)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.creamSoft,
  },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 13,
    paddingRight: 6,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.mist,
  },
  headerTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.6,
    color: theme.colors.ink,
  },
  collapseBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: 6,
    paddingBottom: RAF_ALT_BOSLUK,
  },
  // Altı çizili başlık: çizgi yazıdan biraz aralıklı (kenarlık, metin süsü değil)
  groupTitleWrap: {
    alignSelf: 'flex-start',
    marginHorizontal: 13,
    marginTop: 14,
    marginBottom: 7,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gold,
  },
  groupTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    letterSpacing: 1.4,
    color: theme.colors.gold,
  },
  row: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  rowActive: {
    borderLeftColor: theme.colors.bordo,
    backgroundColor: theme.colors.cream,
  },
  label: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 15,
    lineHeight: 19,
  },
  labelActive: { color: theme.colors.bordo },
  labelInactive: { color: 'rgba(10,10,10,0.45)' },
});
