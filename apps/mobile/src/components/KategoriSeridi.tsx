import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Category } from '../api/queries';
import { rafGruplari } from '../lib/category-rail';
import { theme } from '../theme';

interface KategoriSeridiProps {
  categories: Category[];
  activeId: string | null;
  onChange: (id: string) => void;
  /** Onboarding'de seçilenler — şeridin başında, seçim sırasıyla. */
  pinnedIds?: string[];
}

// Keşfet'in yana kayan kategori şeridi (1.2.4; sol rafın yerine): yuvarlak çerçeveli
// düğmeler, seçili olan açık bordo. Sıra soldaki rafla aynı kural: önce onboarding'de seçilenler.
export function KategoriSeridi({
  categories,
  activeId,
  onChange,
  pinnedIds = [],
}: KategoriSeridiProps) {
  const adlar = new Map(categories.map((c) => [c.id, c.name.trim()]));
  const idler = rafGruplari(categories, pinnedIds).flatMap((g) => g.idler);
  const scrollRef = useRef<ScrollView>(null);
  const konumlar = useRef(new Map<string, number>());

  // Seçili kategori (ör. bildirimden açılınca) ekran dışındaysa görünür olsun.
  useEffect(() => {
    if (!activeId) return;
    const x = konumlar.current.get(activeId);
    if (x !== undefined) scrollRef.current?.scrollTo({ x: Math.max(x - 24, 0), animated: true });
  }, [activeId]);

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {idler.map((id) => {
          const aktif = id === activeId;
          return (
            <Pressable
              key={id}
              onPress={() => onChange(id)}
              onLayout={(e) => konumlar.current.set(id, e.nativeEvent.layout.x)}
              accessibilityRole="tab"
              accessibilityState={{ selected: aktif }}
              hitSlop={{ top: 4, bottom: 4 }}
              style={[styles.sekme, aktif && styles.sekmeAktif]}
            >
              <Text style={[styles.yazi, aktif && styles.yaziAktif]}>{adlar.get(id)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingVertical: 4 },
  content: { paddingHorizontal: 24, gap: 8 },
  sekme: {
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CFCAC2',
  },
  sekmeAktif: { backgroundColor: theme.colors.bordoAcik, borderColor: theme.colors.bordoAcik },
  yazi: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: theme.colors.ink,
  },
  yaziAktif: { color: theme.colors.cream },
});
