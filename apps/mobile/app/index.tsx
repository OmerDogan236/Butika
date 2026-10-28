import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuthStore } from '../src/stores/auth';
import { theme } from '../src/theme';

export default function Index() {
  const status = useAuthStore((s) => s.status);

  if (status === 'loading') {
    return (
      <View style={styles.root}>
        <ActivityIndicator color={theme.colors.gold} />
      </View>
    );
  }

  if (status === 'authenticated') return <Redirect href="/(tabs)" />;
  return <Redirect href="/auth" />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cream,
  },
});
