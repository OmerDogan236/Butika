import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export function TestSecenegi({
  etiket,
  aciklama,
  secili,
  vurgulu,
  tekSecim,
  onPress,
}: {
  etiket: string;
  aciklama?: string;
  secili: boolean;
  vurgulu?: boolean;
  tekSecim?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole={tekSecim ? 'radio' : 'checkbox'}
      accessibilityState={tekSecim ? { selected: secili } : { checked: secili }}
      style={({ pressed }) => [
        styles.secenek,
        secili && styles.secenekSecili,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.secenekMetin}>
        <Text
          style={[
            styles.secenekEtiket,
            secili && styles.secenekEtiketSecili,
            vurgulu && styles.vurgulu,
          ]}
        >
          {etiket}
        </Text>
        {aciklama ? <Text style={styles.secenekAciklama}>{aciklama}</Text> : null}
      </View>
      <Ionicons
        name={secili ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={secili ? theme.colors.gold : theme.colors.inkFaint}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  secenek: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    backgroundColor: theme.colors.cream,
  },
  secenekSecili: { borderColor: theme.colors.gold, backgroundColor: `${theme.colors.gold}14` },
  secenekMetin: { flex: 1, gap: 3 },
  secenekEtiket: { fontFamily: 'Inter_500Medium', fontSize: 16, color: theme.colors.inkMute },
  secenekEtiketSecili: { color: theme.colors.ink },
  secenekAciklama: { ...theme.type.caption, color: theme.colors.inkFaint },
  vurgulu: { fontFamily: 'Newsreader_400Regular', fontSize: 18 },
});
