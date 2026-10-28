import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonText } from './Skeleton';

export function BoutiqueCardSkeleton() {
  return (
    <View style={styles.root}>
      <Skeleton aspectRatio={4 / 5} radius={4} />
      <SkeletonText width="80%" height={18} />
      <SkeletonText width="60%" height={12} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: 10,
  },
});
