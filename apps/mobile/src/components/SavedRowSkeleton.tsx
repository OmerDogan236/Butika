import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { Skeleton, SkeletonText } from './Skeleton';

export function SavedRowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={64} height={80} radius={4} />
      <View style={styles.text}>
        <SkeletonText width="85%" height={14} />
        <SkeletonText width="40%" height={10} />
      </View>
    </View>
  );
}

export function SavedSectionSkeleton() {
  return (
    <View>
      <View style={styles.header}>
        <Skeleton width={140} height={26} radius={2} />
      </View>
      {[0, 1].map((i) => (
        <SavedRowSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    marginBottom: 8,
  },
  row: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  text: { flex: 1, gap: 8 },
});
