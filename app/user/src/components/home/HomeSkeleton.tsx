import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Skeleton } from '@/components/ui';
import { radius, space } from '@/theme';

/** Placeholder layout mirroring the Home sections while data "loads". */
export const HomeSkeleton = memo(function HomeSkeleton() {
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.wrap}>
      <Skeleton height={190} radius={radius.xl} />
      <View>
        <Skeleton width={160} height={18} radius={6} style={styles.title} />
        <Skeleton height={290} radius={radius.lg} />
      </View>
      <View>
        <Skeleton width={130} height={18} radius={6} style={styles.title} />
        <View style={styles.row}>
          <Skeleton width={124} height={156} radius={radius.lg} />
          <Skeleton width={124} height={156} radius={radius.lg} />
          <Skeleton width={124} height={156} radius={radius.lg} />
        </View>
      </View>
      <View style={styles.grid}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Skeleton height={132} radius={radius.lg} />
          </View>
          <View style={styles.flex}>
            <Skeleton height={132} radius={radius.lg} />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Skeleton height={132} radius={radius.lg} />
          </View>
          <View style={styles.flex}>
            <Skeleton height={132} radius={radius.lg} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.xxl, marginTop: space.xxl },
  title: { marginBottom: space.md },
  row: { flexDirection: 'row', gap: space.md, overflow: 'hidden' },
  grid: { gap: space.md },
  flex: { flex: 1 },
});
