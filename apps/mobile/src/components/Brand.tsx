import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export function BrandMark({ size = 96 }: { size?: number }) {
  return (
    <View style={styles.wrap}>
      <Text style={[styles.text, { fontSize: size }]}>Butika</Text>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  text: {
    fontFamily: 'Newsreader_400Regular',
    color: theme.colors.ink,
    lineHeight: undefined,
  },
  rule: {
    marginTop: 24,
    height: 1,
    width: 96,
    backgroundColor: theme.colors.gold,
  },
});
