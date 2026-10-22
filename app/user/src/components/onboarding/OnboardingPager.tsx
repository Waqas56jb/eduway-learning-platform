import { router } from 'expo-router';
import { isRTL } from '@/utils/rtl';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon, Logo } from '@/components/icons';
import { Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { usePrefsStore } from '@/store/prefsStore';
import { palette, space } from '@/theme';
import { haptic } from '@/utils/haptics';
import { CinematicCopy } from './CinematicCopy';
import { CinematicScrim } from './CinematicScrim';
import { GoldButton, goldButtonStyles } from './GoldButton';
import { KenBurnsImage } from './KenBurnsImage';
import { clampIndex, logicalProgress, offsetFor, visualOrder } from './pagerMath';
import { ProgressSegments } from './ProgressSegments';
import { TextButton } from './TextButton';
import { CTA_HEIGHT, ink, onboardingMedia, prefetchOnboardingMedia, useCinematicMetrics, type CinematicImage } from './tokens';

const PAGES = 3;
const LAST = PAGES - 1;
const TOP_BAR = 52;
const SECONDARY_H = 48;
const PROGRESS_H = 12;

const SLIDES: { key: 'slide1' | 'slide2' | 'slide3'; image: CinematicImage }[] = [
  { key: 'slide1', image: onboardingMedia.learn },
  { key: 'slide2', image: onboardingMedia.practice },
  { key: 'slide3', image: onboardingMedia.tutor },
];

type Destination = '/(auth)/welcome' | '/(auth)/register' | '/(auth)/login';

export interface OnboardingPagerProps {
  /** Logical slide to open on (0–2); used by the deep-linkable splash routes. */
  initialIndex?: number;
}

interface SlideProps {
  logical: number;
  slot: number;
  active: boolean;
  scrollX: SharedValue<number>;
  width: number;
  height: number;
  rtl: boolean;
  gutter: number;
  topHeight: number;
  copyBottom: number;
  titleSize: number;
  overline: string;
  title: string;
  subtitle: string;
}

/** One full-bleed story page: Ken Burns photo → scrims → staggered editorial copy. */
const Slide = memo(function Slide({
  logical,
  slot,
  active,
  scrollX,
  width,
  height,
  rtl,
  gutter,
  topHeight,
  copyBottom,
  titleSize,
  overline,
  title,
  subtitle,
}: SlideProps) {
  // Copy travels with the page but dissolves before the halfway point of a swipe.
  const fade = useAnimatedStyle(() => {
    const rel = Math.abs(scrollX.value - slot * width);
    return { opacity: interpolate(rel, [0, width * 0.45], [1, 0], Extrapolation.CLAMP) };
  });

  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <KenBurnsImage
        image={SLIDES[logical].image}
        active={active}
        drift={logical}
        width={width}
        height={height}
        scrollX={scrollX}
        slot={slot}
        priority={logical === 0 ? 'high' : 'normal'}
      />
      <CinematicScrim topHeight={topHeight} fadeStart={0.4} />
      <Animated.View
        style={[
          styles.copy,
          { direction: rtl ? 'rtl' : 'ltr', paddingHorizontal: gutter, paddingBottom: copyBottom },
          fade,
        ]}
        pointerEvents="none"
      >
        <CinematicCopy overline={overline} title={title} subtitle={subtitle} active={active} titleSize={titleSize} />
      </Animated.View>
    </View>
  );
});

/**
 * Cinematic three-slide onboarding: full-bleed photography with Ken Burns + 0.5× parallax,
 * editorial copy that re-reveals on every slide, story-style progress and a morphing gold CTA.
 *
 * RTL: the scroll view is pinned to `direction: 'ltr'` and slides are rendered in reverse
 * visual order under native RTL (see `pagerMath.ts`), so swiping always follows the reading
 * direction and offsets behave identically on iOS and Android.
 */
export function OnboardingPager({ initialIndex = 0 }: OnboardingPagerProps) {
  const { width, height, insets, gutter, compact, titleSize, bottomPad } = useCinematicMetrics();
  const { t } = useI18n('onboarding');
  const rtl = isRTL();
  const start = clampIndex(Math.round(initialIndex), PAGES);
  const order = useMemo(() => visualOrder(PAGES, rtl), [rtl]);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(offsetFor(start, width, PAGES, rtl));
  const [index, setIndex] = useState(start);
  const positioned = useRef(false);

  useEffect(() => {
    prefetchOnboardingMedia();
  }, []);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  const progress = useDerivedValue(() => logicalProgress(scrollX.value, width, PAGES, rtl));
  /** 0 on slides 1–2, 1 on the last slide; continuous while swiping. */
  const lastness = useDerivedValue(() =>
    interpolate(progress.value, [LAST - 1, LAST], [0, 1], Extrapolation.CLAMP),
  );

  useAnimatedReaction(
    () => clampIndex(Math.round(progress.value), PAGES),
    (cur, prev) => {
      if (prev !== null && cur !== prev) scheduleOnRN(setIndex, cur);
    },
  );

  const firstIndex = useRef(true);
  useEffect(() => {
    if (firstIndex.current) {
      firstIndex.current = false;
      return;
    }
    haptic.selection();
  }, [index]);

  const goTo = useCallback(
    (logical: number) => {
      scrollRef.current?.scrollTo({ x: offsetFor(logical, width, PAGES, rtl), y: 0, animated: true });
    },
    [rtl, scrollRef, width],
  );

  const onLayout = useCallback(() => {
    // `contentOffset` is honored on iOS; make sure Android also lands on the deep-linked slide.
    if (positioned.current) return;
    positioned.current = true;
    const x = offsetFor(start, width, PAGES, rtl);
    if (x > 0) scrollRef.current?.scrollTo({ x, y: 0, animated: false });
  }, [rtl, scrollRef, start, width]);

  const finish = useCallback((to: Destination) => {
    usePrefsStore.getState().setOnboardingSeen(true);
    router.replace('/(auth)/welcome');
    // Register/login open on top of Welcome so "back" lands somewhere meaningful.
    if (to !== '/(auth)/welcome') router.push(to);
  }, []);

  const isLast = index === LAST;

  // ---- layout ----
  const topHeight = insets.top + TOP_BAR + space.xl;
  const controlsFull = bottomPad + SECONDARY_H + CTA_HEIGHT + space.xl + PROGRESS_H;
  const copyGap = compact ? space.xl : space.xxxl - 4;
  const copyBottomFor = (logical: number) =>
    (logical === LAST ? controlsFull : controlsFull - SECONDARY_H) + copyGap;

  // ---- fixed control animations ----
  const controlsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - lastness.value) * SECONDARY_H }],
  }));
  const secondaryStyle = useAnimatedStyle(() => ({ opacity: lastness.value }));
  const skipStyle = useAnimatedStyle(() => ({ opacity: 1 - lastness.value }));
  const nextLabel = useAnimatedStyle(() => ({
    opacity: interpolate(lastness.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: -10 * lastness.value }],
  }));
  const startLabel = useAnimatedStyle(() => ({
    opacity: interpolate(lastness.value, [0.5, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: 10 * (1 - lastness.value) }],
  }));

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        overScrollMode="never"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={onLayout}
        contentOffset={{ x: offsetFor(start, width, PAGES, rtl), y: 0 }}
        style={styles.scroller}
        accessibilityLabel={t('a11y.pager')}
      >
        {order.map((logical, slot) => {
          const key = SLIDES[logical].key;
          return (
            <Slide
              key={key}
              logical={logical}
              slot={slot}
              active={index === logical}
              scrollX={scrollX}
              width={width}
              height={height}
              rtl={rtl}
              gutter={gutter}
              topHeight={topHeight}
              copyBottom={copyBottomFor(logical)}
              titleSize={titleSize}
              overline={t(`${key}.overline`)}
              title={t(`${key}.title`)}
              subtitle={t(`${key}.subtitle`)}
            />
          );
        })}
      </Animated.ScrollView>

      {/* Top bar */}
      <View
        style={[styles.topBar, { top: insets.top, paddingStart: gutter, paddingEnd: gutter - space.sm }]}
        pointerEvents="box-none"
      >
        <Logo size={30} variant="light" withWordmark wordmarkPosition="beside" />
        <Animated.View style={skipStyle} pointerEvents={isLast ? 'none' : 'auto'}>
          <TextButton
            title={t('skip')}
            color={ink.white}
            accessibilityLabel={t('a11y.skip')}
            onPress={() => finish('/(auth)/welcome')}
          />
        </Animated.View>
      </View>

      {/* Bottom controls */}
      <Animated.View
        style={[styles.controls, { paddingHorizontal: gutter, paddingBottom: bottomPad }, controlsStyle]}
        pointerEvents="box-none"
      >
        <ProgressSegments
          count={PAGES}
          index={index}
          progress={progress}
          accessibilityLabel={t('a11y.slideOf', { current: index + 1, total: PAGES })}
        />
        <GoldButton
          accessibilityLabel={isLast ? t('getStarted') : t('a11y.next')}
          onPress={() => (isLast ? finish('/(auth)/register') : goTo(index + 1))}
          style={styles.cta}
        >
          <Animated.View style={[goldButtonStyles.row, nextLabel]} pointerEvents="none">
            <Text variant="bodyBold" color={palette.navy} numberOfLines={1} style={goldButtonStyles.label}>
              {t('next')}
            </Text>
            <Icon name="arrow" size={20} color={palette.navy} strokeWidth={2.2} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, goldButtonStyles.row, startLabel]} pointerEvents="none">
            <Text variant="bodyBold" color={palette.navy} numberOfLines={1} style={goldButtonStyles.label}>
              {t('getStarted')}
            </Text>
            <Icon name="arrow" size={20} color={palette.navy} strokeWidth={2.2} />
          </Animated.View>
        </GoldButton>
        <Animated.View style={[styles.secondary, secondaryStyle]} pointerEvents={isLast ? 'box-none' : 'none'}>
          <TextButton
            title={t('haveAccount')}
            color={ink.goldHi}
            onPress={() => finish('/(auth)/login')}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.navy900 },
  scroller: { flex: 1, direction: 'ltr' },
  copy: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  topBar: {
    position: 'absolute',
    start: 0,
    end: 0,
    height: TOP_BAR,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controls: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  cta: { marginTop: space.xl },
  secondary: { height: SECONDARY_H, justifyContent: 'center', alignItems: 'center' },
});
