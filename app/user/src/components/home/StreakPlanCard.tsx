import { memo, useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale, ProgressBar, Text } from '@/components/ui';
import { useDashboard } from '@/api';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { palette, radius, shadows, space, useTheme } from '@/theme';
import { formatDate } from '@/utils/format';

const ICON_BOX = 30;
const FOOT_HEIGHT = 10;
/** Placeholder week while the dashboard loads. */
const EMPTY_WEEK = Array.from({ length: 7 }, (_, i) => ({ date: String(i), active: false }));

/** The one ambient animation on Home: a gently breathing flame. */
function Flame({ active }: { active: boolean }) {
  const reduceMotion = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || !active) return;
    v.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(v);
  }, [active, reduceMotion, v]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + v.value * 0.1 }, { translateY: -v.value }] }));
  return (
    <Animated.View style={style}>
      <Icon name="flame" size={16} color={active ? '#EA7A1A' : palette.gold} filled={active} />
    </Animated.View>
  );
}

interface ColumnProps {
  icon: ReactNode;
  overline: string;
  value: string;
  unit: string;
  footer: ReactNode;
  onPress: () => void;
  a11y: string;
}

/** One half of the card. Both halves share the exact same structure so every row lines up. */
function Column({ icon, overline, value, unit, footer, onPress, a11y }: ColumnProps) {
  const { colors, isDark } = useTheme();
  const accentInk = isDark ? colors.accentLight : '#8A6A22';
  return (
    <PressableScale onPress={onPress} scaleTo={0.96} accessibilityRole="button" accessibilityLabel={a11y} style={styles.column}>
      <View style={styles.overRow}>
        <View style={[styles.iconBox, { backgroundColor: colors.accentSoft }]}>{icon}</View>
        <Text variant="overline" color={accentInk} numberOfLines={1} style={styles.overline}>
          {overline}
        </Text>
      </View>
      <View style={styles.valueRow}>
        <Text variant="h1" display tabular numberOfLines={1} style={styles.value}>
          {value}
        </Text>
        <Text variant="label" color="muted" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.unit}>
          {unit}
        </Text>
      </View>
      <View style={styles.footer}>{footer}</View>
    </PressableScale>
  );
}

/** Refined summary card: study streak (with this week's dots) and subscription days left. Gold is an accent only. */
export const StreakPlanCard = memo(function StreakPlanCard() {
  const { colors, isDark } = useTheme();
  const { t, L, lang } = useI18n('home');
  const user = useAuthStore((s) => s.user);
  const { data } = useDashboard();
  const streak = data?.streak.current ?? user?.streak ?? 0;
  const week = data?.streak.last7.length ? data.streak.last7 : EMPTY_WEEK;
  const sub = data?.subscription;
  const packageName = sub?.packageName ?? null;
  const hasPlan = !!packageName && (sub?.status === 'active' || sub?.status === 'trial');

  const streakColumn = (
    <Column
      icon={<Flame active={streak > 0} />}
      overline={t('summary.streak')}
      value={String(streak)}
      unit={t('summary.streakUnit', { count: streak })}
      onPress={() => router.push('/progress')}
      a11y={t('header.streakLabel', { count: streak })}
      footer={
        <View style={styles.dots}>
          {week.map((d, i) => {
            const on = d.active;
            const today = i === week.length - 1;
            return (
              <View
                key={d.date}
                style={[
                  styles.dot,
                  { backgroundColor: on ? palette.gold : colors.surfaceMuted },
                  today && { borderWidth: 1.5, borderColor: isDark ? colors.accentLight : palette.navy },
                ]}
              />
            );
          })}
        </View>
      }
    />
  );

  let planColumn: ReactNode;
  if (sub && hasPlan && packageName) {
    const daysRemaining = sub.daysRemaining;
    const totalDays = Math.max(1, sub.totalDays);
    const leftPct = Math.min(100, Math.max(0, Math.round((daysRemaining / totalDays) * 100)));
    const name = L(packageName);
    const endsAt = user?.subscriptionEnd;
    planColumn = (
      <Column
        icon={<Icon name="crown" size={15} color={palette.gold} filled />}
        overline={name}
        value={String(daysRemaining)}
        unit={t('summary.daysUnit', { count: daysRemaining })}
        onPress={() => router.push('/subscription')}
        a11y={`${t('subscription.a11y', { name, days: daysRemaining })}${
          endsAt
            ? `. ${t('subscription.endsOn', { date: formatDate(endsAt, lang, { day: 'numeric', month: 'long' }) })}`
            : ''
        }`}
        footer={<ProgressBar progress={leftPct} height={4} gradient />}
      />
    );
  } else {
    planColumn = (
      <Column
        icon={<Icon name="crown" size={15} color={palette.gold} />}
        overline={t('subscription.noPlan')}
        value="0"
        unit={t('summary.daysUnit', { count: 0 })}
        onPress={() => router.push('/subscription')}
        a11y={t('subscription.viewPlans')}
        footer={
          <Text variant="label" color={isDark ? colors.accentLight : '#8A6A22'} numberOfLines={1}>
            {t('subscription.viewPlans')}
          </Text>
        }
      />
    );
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(201,162,74,0.28)' : 'rgba(201,162,74,0.35)' },
        !isDark && shadows.sm,
      ]}
    >
      <View style={[styles.accent, { backgroundColor: palette.gold }]} pointerEvents="none" />
      {streakColumn}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      {planColumn}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    top: 0,
    start: space.xl,
    width: 36,
    height: 3,
    borderBottomStartRadius: 3,
    borderBottomEndRadius: 3,
  },
  column: { flex: 1, minWidth: 0 },
  divider: { width: StyleSheet.hairlineWidth, marginHorizontal: space.lg },
  overRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  iconBox: {
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: ICON_BOX / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overline: { flex: 1, textTransform: 'uppercase' },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xs + 2,
    marginTop: space.md,
  },
  value: { flexShrink: 0 },
  unit: { flexShrink: 1 },
  footer: { minHeight: FOOT_HEIGHT, justifyContent: 'center', marginTop: space.sm + 2 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
});
