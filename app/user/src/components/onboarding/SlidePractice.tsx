import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { palette, radius, space } from '@/theme';
import { DESIGN_W, GoldGlow, IllustrationCanvas, ink, type SlideProps } from './shared';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** 0 = idle, 1 = picked (gold), 2 = wrong (red), 3 = correct (green). */
type OptionTone = 0 | 1 | 2 | 3;

const CORRECT = 0;
const WRONG = 1;
const CHECK_LEN = 40;

const LETTERS = { en: ['A', 'B', 'C', 'D'], ar: ['أ', 'ب', 'ج', 'د'] } as const;

const OptionCard = memo(function OptionCard({ label, tone, index }: { label: string; tone: OptionTone; index: number }) {
  const { lang } = useI18n('onboarding');
  const v = useSharedValue<number>(0);
  const pop = useSharedValue(1);

  useEffect(() => {
    v.value = withTiming(tone, { duration: 320 });
    if (tone >= 2) pop.value = withSequence(withTiming(1.05, { duration: 140 }), withSpring(1, { damping: 10 }));
  }, [tone, v, pop]);

  const box = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(v.value, [0, 1, 2, 3], ['#FFFFFF', '#FBF5E6', '#FDECEC', '#E8F7EE']),
    borderColor: interpolateColor(v.value, [0, 1, 2, 3], ['#E8E2D6', palette.gold, palette.danger, palette.success]),
    transform: [{ scale: pop.value }],
  }));

  const letter = LETTERS[lang][index] ?? '';
  const color = tone === 3 ? palette.success : tone === 2 ? palette.danger : palette.navy;
  return (
    <Animated.View style={[styles.option, box]}>
      <View style={[styles.letter, { backgroundColor: tone >= 2 ? color : 'rgba(11,31,58,0.06)' }]}>
        {tone === 3 ? (
          <Icon name="check" size={13} color={palette.white} strokeWidth={2.5} />
        ) : tone === 2 ? (
          <Icon name="close" size={12} color={palette.white} strokeWidth={2.5} />
        ) : (
          <Text variant="label" color={palette.navy}>
            {letter}
          </Text>
        )}
      </View>
      <Text variant="bodyBold" color={color} style={styles.optionLabel}>
        {label}
      </Text>
    </Animated.View>
  );
});

/** Stacked "mistake" card that tilts as the pager moves. */
const MistakeCard = memo(function MistakeCard({
  title,
  tag,
  retry,
  baseRotate,
  offsetX,
  top,
  tilt,
  slotProps,
}: {
  title: string;
  tag: string;
  retry: string;
  baseRotate: number;
  offsetX: number;
  top: number;
  tilt: number;
  slotProps: Pick<SlideProps, 'scrollX' | 'slot' | 'width'>;
}) {
  const { scrollX, slot, width } = slotProps;
  const style = useAnimatedStyle(() => {
    const rel = (scrollX.value - slot * width) / width;
    return {
      transform: [
        { translateX: offsetX + rel * 60 * tilt },
        { rotateZ: `${baseRotate + rel * 14 * tilt}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[styles.mistake, { top }, style]}>
      <View style={styles.mistakeHead}>
        <View style={styles.mistakeTag}>
          <Icon name="x-circle" size={12} color={palette.danger} />
          <Text variant="caption" color={palette.danger}>
            {tag}
          </Text>
        </View>
        <View style={styles.retry}>
          <Icon name="refresh" size={12} color={palette.gold} />
          <Text variant="caption" color={palette.goldLight}>
            {retry}
          </Text>
        </View>
      </View>
      <Text variant="label" color={ink.white} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.skeletonLine} />
    </Animated.View>
  );
});

export const SlidePracticeIllustration = memo(function SlidePracticeIllustration(props: SlideProps) {
  const { scale, active, scrollX, slot, width } = props;
  const { t } = useI18n('onboarding');
  const [tones, setTones] = useState<OptionTone[]>([0, 0, 0, 0]);
  const check = useSharedValue(0);
  const badge = useSharedValue(0);

  useEffect(() => {
    setTones([0, 0, 0, 0]);
    check.value = 0;
    badge.value = 0;
    if (!active) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const tonesFor = (wrong: OptionTone, correct: OptionTone): OptionTone[] =>
      [0, 1, 2, 3].map((i) => (i === WRONG ? wrong : i === CORRECT ? correct : 0)) as OptionTone[];
    const run = (offset: number) => {
      at(offset + 500, () => setTones(tonesFor(1, 0)));
      at(offset + 1100, () => setTones(tonesFor(2, 0)));
      at(offset + 1900, () => setTones(tonesFor(2, 1)));
      at(offset + 2400, () => {
        setTones(tonesFor(2, 3));
        badge.value = withSpring(1, { damping: 11, stiffness: 160 });
        check.value = withDelay(180, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
      });
      at(offset + 5600, () => {
        setTones([0, 0, 0, 0]);
        badge.value = withTiming(0, { duration: 250 });
        check.value = 0;
      });
    };
    // Loop the demo a few times while the slide is visible.
    for (let i = 0; i < 6; i++) run(i * 6000);
    return () => timers.forEach(clearTimeout);
  }, [active, check, badge]);

  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - check.value) }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badge.value,
    transform: [{ scale: interpolate(badge.value, [0, 1], [0.4, 1]) }],
  }));
  const toastStyle = useAnimatedStyle(() => ({
    opacity: badge.value,
    transform: [{ translateY: interpolate(badge.value, [0, 1], [8, 0]) }],
  }));

  const options = [t('slide2.option1'), t('slide2.option2'), t('slide2.option3'), t('slide2.option4')];
  const slotProps = { scrollX, slot, width };

  return (
    <IllustrationCanvas scale={scale}>
      <GoldGlow size={360} opacity={0.28} style={styles.glow} />
      <MistakeCard
        title={t('slide2.mistake2')}
        tag={t('slide2.mistakeTag')}
        retry={t('slide2.retry')}
        baseRotate={7}
        offsetX={26}
        top={8}
        tilt={1}
        slotProps={slotProps}
      />
      <MistakeCard
        title={t('slide2.mistake1')}
        tag={t('slide2.mistakeTag')}
        retry={t('slide2.retry')}
        baseRotate={-6}
        offsetX={-18}
        top={30}
        tilt={-0.7}
        slotProps={slotProps}
      />

      <View style={styles.quiz} accessible accessibilityRole="image" accessibilityLabel={t('a11y.quizPreview')}>
        <View style={styles.quizHead}>
          <Text variant="caption" color={ink.navyMuted}>
            {t('slide2.questionLabel')}
          </Text>
          <View style={styles.qTrack}>
            <View style={styles.qFill} />
          </View>
        </View>
        <Text variant="bodyBold" color={palette.navy} style={styles.question}>
          {t('slide2.question')}
        </Text>
        <View style={styles.grid}>
          {options.map((label, i) => (
            <OptionCard key={i} index={i} label={label} tone={tones[i] ?? 0} />
          ))}
        </View>
        <Animated.View style={[styles.toast, toastStyle]}>
          <Icon name="sparkles" size={14} color={palette.success} />
          <Text variant="label" color={palette.success}>
            {t('slide2.correct')}
          </Text>
        </Animated.View>

        <Animated.View style={[styles.badge, badgeStyle]}>
          <Svg width={34} height={34} viewBox="0 0 34 34">
            <AnimatedPath
              d="M9 17.5 L15 23.5 L26 11.5"
              stroke={palette.white}
              strokeWidth={3.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray={CHECK_LEN}
              animatedProps={checkProps}
            />
          </Svg>
        </Animated.View>
      </View>
    </IllustrationCanvas>
  );
});

const QUIZ_W = DESIGN_W - 36;

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: -10, start: -20 },
  mistake: {
    position: 'absolute',
    alignSelf: 'center',
    width: 236,
    padding: space.md,
    gap: 6,
    borderRadius: radius.lg,
    backgroundColor: '#15325C',
    borderWidth: 1,
    borderColor: ink.hairline,
  },
  mistakeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mistakeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(220,38,38,0.16)',
  },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  skeletonLine: { height: 6, width: '70%', borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)' },
  quiz: {
    position: 'absolute',
    alignSelf: 'center',
    top: 92,
    width: QUIZ_W,
    padding: space.lg,
    borderRadius: 24,
    backgroundColor: palette.cream,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  quizHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  qTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(11,31,58,0.08)', overflow: 'hidden' },
  qFill: { width: '30%', height: 4, borderRadius: 2, backgroundColor: palette.gold },
  question: { marginTop: space.sm, marginBottom: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: {
    width: (QUIZ_W - space.lg * 2 - space.sm) / 2,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  letter: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optionLabel: { writingDirection: 'ltr' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.md,
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(22,163,74,0.12)',
  },
  badge: {
    position: 'absolute',
    top: -20,
    end: -12,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.success,
    borderWidth: 4,
    borderColor: palette.navy,
  },
});
