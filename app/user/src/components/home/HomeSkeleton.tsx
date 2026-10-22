import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Skeleton } from '@/components/ui';
import { radius, SCREEN_PADDING, space } from '@/theme';

const GAP = space.md;

/** Placeholder mirroring the Home layout (hero, summary, carousel, 2×2 stats) while data loads. */
export const HomeSkeleton = memo(function HomeSkeleton() {
  const { width } = useWindowDimensions();
  const contentWidth = width - SCREEN_PADDING * 2;
  const heroImage = Math.round(Math.min(260, Math.max(196, contentWidth * 0.66)));
  const half = Math.floor((contentWidth - GAP) / 2);
  const carouselCard = Math.round(Math.min(172, Math.max(120, (contentWidth - GAP * 2) / 2.35)));

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.wrap}>
      <Skeleton height={heroImage + 64} radius={radius.lg} />
      <Skeleton height={112} radius={radius.lg} />
      <View>
        <Skeleton width={150} height={18} radius={6} style={styles.title} />
        <View style={styles.carousel}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={carouselCard} height={150} radius={radius.lg} />
          ))}
        </View>
      </View>
      <View>
        <Skeleton width={120} height={18} radius={6} style={styles.title} />
        <View style={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width={half} height={140} radius={radius.lg} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 28, marginTop: space.xxl },
  title: { marginBottom: space.md },
  carousel: { flexDirection: 'row', gap: GAP, overflow: 'hidden', marginEnd: -SCREEN_PADDING },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
});
