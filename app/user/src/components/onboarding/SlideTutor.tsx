import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { fonts, gradients, palette, radius, space } from '@/theme';
import { DESIGN_H, GoldGlow, IllustrationCanvas, ink, type SlideProps } from './shared';

const TOTAL_AI = 100;
const TYPE_MS = 24;

const Dot = memo(function Dot({ delay }: { delay: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }),
          withTiming(0, { duration: 300 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, v]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.45 + v.value * 0.55,
    transform: [{ translateY: -4 * v.value }],
  }));
  return <Animated.View style={[styles.dot, style]} />;
});

/** Three bouncing dots inside a tutor-side bubble. */
const Typing = memo(function Typing() {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={[styles.bubble, styles.tutorBubble, styles.typing]}>
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </Animated.View>
  );
});

type Stage = 'idle' | 'asked' | 'typing' | 'intro' | 'formula' | 'outro' | 'done';

export const SlideTutorIllustration = memo(function SlideTutorIllustration({ scale, active }: SlideProps) {
  const { t } = useI18n('onboarding');
  const intro = useMemo(() => Array.from(t('slide3.replyIntro')), [t]);
  const outro = useMemo(() => Array.from(t('slide3.replyOutro')), [t]);

  const [stage, setStage] = useState<Stage>('idle');
  const [introLen, setIntroLen] = useState(0);
  const [outroLen, setOutroLen] = useState(0);

  // Scripted conversation; restarts each time the slide becomes active.
  useEffect(() => {
    setStage('idle');
    setIntroLen(0);
    setOutroLen(0);
    if (!active) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let interval: ReturnType<typeof setInterval> | undefined;
    const typeOut = (len: number, set: (n: number) => void, done: () => void) => {
      let n = 0;
      interval = setInterval(() => {
        n += 1;
        set(n);
        if (n >= len) {
          if (interval) clearInterval(interval);
          done();
        }
      }, TYPE_MS);
    };
    timers.push(setTimeout(() => setStage('asked'), 350));
    timers.push(setTimeout(() => setStage('typing'), 1100));
    timers.push(
      setTimeout(() => {
        setStage('intro');
        typeOut(intro.length, setIntroLen, () => {
          setStage('formula');
          timers.push(
            setTimeout(() => {
              setStage('outro');
              typeOut(outro.length, setOutroLen, () => setStage('done'));
            }, 550),
          );
        });
      }, 2500),
    );
    return () => {
      timers.forEach(clearTimeout);
      if (interval) clearInterval(interval);
    };
  }, [active, intro.length, outro.length]);

  const remaining = stage === 'idle' ? 74 : 73;
  const showReply = stage === 'intro' || stage === 'formula' || stage === 'outro' || stage === 'done';
  const showFormula = stage === 'formula' || stage === 'outro' || stage === 'done';
  const showOutro = stage === 'outro' || stage === 'done';

  const pillPulse = useSharedValue(1);
  useEffect(() => {
    if (stage === 'asked') {
      pillPulse.value = withSequence(withTiming(1.12, { duration: 160 }), withTiming(1, { duration: 260 }));
    }
  }, [stage, pillPulse]);
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ scale: pillPulse.value }] }));

  return (
    <IllustrationCanvas scale={scale}>
      <GoldGlow size={380} opacity={0.3} style={styles.glow} />
      <View style={styles.phone} accessible accessibilityRole="image" accessibilityLabel={t('a11y.chatPreview')}>
        <View style={styles.notch} />

        <View style={styles.header}>
          <LinearGradient colors={gradients.gold} style={styles.tutorAvatar}>
            <Icon name="sparkles" size={16} color={palette.navy} />
          </LinearGradient>
          <View style={styles.headerText}>
            <Text variant="label" color={ink.white} numberOfLines={1}>
              {t('slide3.tutorName')}
            </Text>
            <View style={styles.onlineRow}>
              <View style={styles.onlineDot} />
              <Text variant="caption" color={ink.faint} numberOfLines={1}>
                {t('slide3.online')}
              </Text>
            </View>
          </View>
          <Animated.View style={pillStyle} accessibilityLabel={t('slide3.allowanceLabel')}>
            <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.allowance}>
              <Icon name="sparkles" size={11} color={palette.navy} />
              <Text variant="caption" color={palette.navy} tabular style={styles.allowanceText}>
                {t('slide3.allowance', { used: remaining, total: TOTAL_AI })}
              </Text>
            </LinearGradient>
          </Animated.View>
        </View>

        <View style={styles.messages}>
          {stage !== 'idle' && (
            <Animated.View entering={FadeInDown.duration(320)} style={[styles.bubble, styles.studentBubble]}>
              <Text variant="caption" color={palette.navy} style={styles.msgText}>
                {t('slide3.studentMessage')}
              </Text>
            </Animated.View>
          )}
          {stage === 'typing' && <Typing />}
          {showReply && (
            <Animated.View entering={FadeIn.duration(200)} style={[styles.bubble, styles.tutorBubble]}>
              <Text variant="caption" color={ink.white} style={styles.msgText}>
                {intro.slice(0, introLen).join('')}
              </Text>
              {showFormula && (
                <Animated.View entering={FadeInDown.duration(300)} style={styles.formula}>
                  <Text style={styles.formulaText}>{t('slide3.formula')}</Text>
                </Animated.View>
              )}
              {showOutro && (
                <Text variant="caption" color={ink.soft} style={styles.msgText}>
                  {outro.slice(0, outroLen).join('')}
                </Text>
              )}
            </Animated.View>
          )}
        </View>

        <View style={styles.inputBar}>
          <Text variant="caption" color={ink.faint} style={styles.inputText} numberOfLines={1}>
            {t('slide3.inputPlaceholder')}
          </Text>
          <LinearGradient colors={gradients.gold} style={styles.send}>
            <Icon name="send" size={14} color={palette.navy} />
          </LinearGradient>
        </View>
      </View>
    </IllustrationCanvas>
  );
});

const PHONE_W = 262;

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: -20, alignSelf: 'center' },
  phone: {
    alignSelf: 'center',
    width: PHONE_W,
    height: DESIGN_H,
    borderRadius: 40,
    borderWidth: 7,
    borderColor: '#1C2E4A',
    backgroundColor: palette.navy900,
    overflow: 'hidden',
    paddingHorizontal: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 14,
  },
  notch: {
    alignSelf: 'center',
    width: 78,
    height: 20,
    marginTop: 7,
    borderRadius: 12,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ink.hairline,
  },
  tutorAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  allowance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  allowanceText: { writingDirection: 'ltr' },
  messages: { flex: 1, paddingVertical: space.sm, gap: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  bubble: { maxWidth: '86%', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: 16 },
  studentBubble: { alignSelf: 'flex-end', backgroundColor: palette.goldLight, borderBottomEndRadius: 4 },
  tutorBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink.hairline,
    borderBottomStartRadius: 4,
  },
  typing: { flexDirection: 'row', gap: 5, paddingVertical: space.md, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.goldLight },
  msgText: { lineHeight: 17 },
  formula: {
    alignSelf: 'center',
    marginVertical: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(201,162,74,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(201,162,74,0.45)',
  },
  formulaText: {
    fontFamily: fonts.display,
    fontSize: 19,
    lineHeight: 24,
    color: palette.goldLight,
    writingDirection: 'ltr',
    letterSpacing: 0.5,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.md,
    paddingStart: space.md,
    paddingEnd: 4,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink.hairline,
  },
  inputText: { flex: 1 },
  send: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
