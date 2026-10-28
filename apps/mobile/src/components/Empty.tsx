import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export function Empty({ message }: { message: string }) {
  return (
    <View style={styles.root}>
      <View style={styles.rule} />
      <Text style={styles.text}>{message}</Text>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 24,
  },
  rule: {
    width: 48,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.gold,
  },
  text: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 22,
    color: theme.colors.inkMute,
    textAlign: 'center',
    lineHeight: 30,
  },
});
