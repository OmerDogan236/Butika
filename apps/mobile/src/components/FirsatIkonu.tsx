import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

// Alt menüdeki Fırsat sekmesi: içi açık sarı dolu etiket, ortasında "%".
// Dolu etiket zemin, üstüne aynı boyda çerçeveli etiket; renk sekme rengini izler.
const DOLGU = '#F7E6A3';
const BOYUT = 22;

export function FirsatIkonu({ color }: { color: string }) {
  return (
    <View style={styles.kutu}>
      <Ionicons name="pricetag" size={BOYUT} color={DOLGU} style={styles.katman} />
      <Ionicons name="pricetag-outline" size={BOYUT} color={color} style={styles.katman} />
      <Text style={[styles.yuzde, { color }]} allowFontScaling={false}>
        %
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kutu: { width: BOYUT, height: BOYUT },
  katman: { position: 'absolute', top: 0, left: 0 },
  yuzde: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 6,
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 10,
    fontFamily: 'Inter_600SemiBold',
    transform: [{ translateX: 1 }, { translateY: 1 }, { rotate: '-45deg' }],
  },
});
