import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui';
import { BLURHASH, images } from '@/constants/images';
import { subjects } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { gradients, palette, radius, space } from '@/theme';
import { formatDuration } from '@/utils/format';
import { DESIGN_W, IllustrationCanvas, ink, ParallaxLayer, type SlideProps } from './shared';

const LESSON_SEC = 18 * 60 + 5;

/** Full-bleed background photo for slide 1 (moves slower than the page). */
export const SlideLearnBackground = memo(function SlideLearnBackground({
  scrollX,
  slot,
  width,
  height,
}: Pick<SlideProps, 'scrollX' | 'slot' | 'width'> & { height: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <ParallaxLayer
        scrollX={scrollX}
        slot={slot}
        width={width}
        factor={-0.35}
        style={{ position: 'absolute', top: 0, bottom: 0, start: -width * 0.2, width: width * 1.4 }}
      >
        <Image
          source={{ uri: images.onboardingStudents }}
          placeholder={{ blurhash: BLURHASH }}
          transition={400}
          contentFit="cover"
          cachePolicy="memory-disk"
          style={{ width: width * 1.4, height }}
        />
      </ParallaxLayer>
      <LinearGradient
        colors={['rgba(7,20,38,0.55)', 'rgba(11,31,58,0.35)', 'rgba(11,31,58,0.78)', palette.navy, palette.navy]}
        locations={[0, 0.22, 0.5, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
});

/** Glassmorphism mini video player floating over the hero photo. */
export const SlideLearnIllustration = memo(function SlideLearnIllustration({ scale, active }: SlideProps) {
  const { t, L } = useI18n('onboarding');
  const subject = subjects[0];

  const pulse = useSharedValue(0);
  const playback = useSharedValue(0.18);
  const bob = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(pulse);
      cancelAnimation(playback);
      cancelAnimation(bob);
      return;
    }
    pulse.value = 0;
    pulse.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
    playback.value = 0.18;
    playback.value = withRepeat(withTiming(0.92, { duration: 9000, easing: Easing.linear }), -1, false);
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [active, pulse, playback, bob]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.8 }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${playback.value * 100}%` }));
  const knobStyle = useAnimatedStyle(() => ({ start: `${playback.value * 100}%` }));
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * bob.value }] }));
  const bobAltStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -5 * (1 - bob.value) }] }));

  return (
    <IllustrationCanvas scale={scale}>
      <View
        style={styles.center}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('a11y.lessonPreview')}
      >
        <View style={styles.card}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.cardTint} />

          <View style={styles.thumb}>
            <Image
              source={{ uri: subject?.image ?? images.mathBoard }}
              placeholder={{ blurhash: BLURHASH }}
              transition={300}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient colors={gradients.imageOverlay} style={StyleSheet.absoluteFill} />
            <View style={styles.thumbTop}>
              <View style={styles.nowPlaying}>
                <View style={styles.liveDot} />
                <Text variant="caption" color={ink.white}>
                  {t('slide1.nowPlaying')}
                </Text>
              </View>
              <View style={styles.hd}>
                <Text variant="overline" color={palette.navy}>
                  {t('slide1.hd')}
                </Text>
              </View>
            </View>
            <View style={styles.playWrap}>
              <Animated.View style={[styles.playRing, ringStyle]} />
              <LinearGradient colors={gradients.gold} style={styles.playBtn}>
                <Icon name="play" size={24} color={palette.navy} filled />
              </LinearGradient>
            </View>
            <Text variant="label" color={ink.white} style={styles.lessonTag} numberOfLines={1}>
              {t('slide1.lessonTag')}
            </Text>
          </View>

          <View style={styles.track}>
            <Animated.View style={[styles.fill, fillStyle]}>
              <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
            <Animated.View style={[styles.knob, knobStyle]} />
          </View>
          <View style={styles.times}>
            <Text variant="caption" color={ink.faint} tabular>
              {formatDuration(272)}
            </Text>
            <Text variant="caption" color={ink.faint} tabular>
              {formatDuration(LESSON_SEC)}
            </Text>
          </View>

          <View style={styles.teacherRow}>
            <Image
              source={{ uri: images.teacher }}
              placeholder={{ blurhash: BLURHASH }}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={styles.avatar}
            />
            <View style={styles.teacherText}>
              <Text variant="bodyBold" color={ink.white} numberOfLines={1}>
                {L(subject?.teacher)}
              </Text>
              <Text variant="caption" color={ink.soft} numberOfLines={1}>
                {L(subject?.name)}
              </Text>
            </View>
            <View style={styles.rating}>
              <Icon name="star" size={13} color={palette.gold} filled />
              <Text variant="label" color={ink.white} tabular>
                {t('slide1.rating')}
              </Text>
            </View>
          </View>
        </View>

        <Animated.View style={[styles.floatTop, bobStyle]}>
          <Icon name="user" size={14} color={palette.navy} />
          <Text variant="label" color={palette.navy}>
            {t('slide1.learners')}
          </Text>
        </Animated.View>
        <Animated.View style={[styles.floatBottom, bobAltStyle]}>
          <Icon name="captions" size={16} color={palette.gold} />
        </Animated.View>
      </View>
    </IllustrationCanvas>
  );
});

const CARD_W = DESIGN_W - 28;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: CARD_W,
    borderRadius: 26,
    padding: space.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ink.hairline,
  },
  cardTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,31,58,0.38)' },
  thumb: {
    height: 168,
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'space-between',
    backgroundColor: palette.navyLight,
  },
  thumbTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.sm + 2,
  },
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(7,20,38,0.55)',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#EF4444' },
  hd: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: palette.goldLight },
  playWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playRing: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: palette.gold,
  },
  playBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonTag: { paddingHorizontal: space.md, paddingBottom: space.sm + 2 },
  track: {
    height: 4,
    borderRadius: 2,
    marginTop: space.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
  },
  fill: { position: 'absolute', top: 0, bottom: 0, start: 0, borderRadius: 2, overflow: 'hidden' },
  knob: {
    position: 'absolute',
    width: 12,
    height: 12,
    marginStart: -6,
    borderRadius: 6,
    backgroundColor: palette.white,
    borderWidth: 2,
    borderColor: palette.gold,
  },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  teacherRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, marginTop: space.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: palette.gold },
  teacherText: { flex: 1 },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: ink.glassStrong,
  },
  floatTop: {
    position: 'absolute',
    top: 18,
    end: -4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: palette.goldLight,
  },
  floatBottom: {
    position: 'absolute',
    bottom: 34,
    start: -2,
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.navy,
    borderWidth: 1,
    borderColor: 'rgba(201,162,74,0.5)',
  },
});
