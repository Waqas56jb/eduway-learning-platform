import { memo, useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import Animated, {
  FadeIn,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale, ProgressBar, Text } from '@/components/ui';
import { todayPlan, type PlanItem, type PlanKind } from '@/data/home';
import { useI18n } from '@/hooks/useI18n';
import { HIT_SLOP, palette, radius, shadows, space, subjectColors, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';
import { withAlpha } from './color';

const KIND_ICON: Record<PlanKind, IconName> = {
  lesson: 'play',
  quiz: 'quiz',
  mistakes: 'mistakes',
  exam: 'exam',
};

/** "Today's plan" checklist with animated checkboxes (local state). */
export const TodayPlan = memo(function TodayPlan() {
  const { colors, isDark } = useTheme();
  const { t } = useI18n('home');
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(todayPlan.map((p) => [p.id, p.done])),
  );
  const doneCount = todayPlan.filter((p) => done[p.id]).length;
  const total = todayPlan.length;
  const allDone = doneCount === total;

  const toggle = useCallback(
    (id: string) => {
      const next = { ...done, [id]: !done[id] };
      if (todayPlan.every((p) => next[p.id])) haptic.success();
      else if (next[id]) haptic.light();
      else haptic.selection();
      setDone(next);
    },
    [done],
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.sm]}>
      <View style={styles.head}>
        <Text variant="label" color="muted" tabular>
          {t('plan.progress', { done: doneCount, total })}
        </Text>
        <View style={styles.headBar}>
          <ProgressBar progress={Math.round((doneCount / total) * 100)} height={6} gradient />
        </View>
      </View>

      {allDone ? (
        <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={[styles.allDone, { backgroundColor: colors.successSoft }]}>
          <Icon name="trophy" size={16} color={colors.success} />
          <Text variant="label" color="success" style={styles.flex}>
            {t('plan.allDone')}
          </Text>
        </Animated.View>
      ) : null}

      {todayPlan.map((item, i) => (
        <PlanRow key={item.id} item={item} checked={!!done[item.id]} onToggle={toggle} last={i === total - 1} />
      ))}
    </View>
  );
});

interface PlanRowProps {
  item: PlanItem;
  checked: boolean;
  onToggle: (id: string) => void;
  last: boolean;
}

const PlanRow = memo(function PlanRow({ item, checked, onToggle, last }: PlanRowProps) {
  const { colors, isDark } = useTheme();
  const { t, L } = useI18n('home');
  const color = subjectColors[item.subjectId];
  const title = L(item.title);

  const progress = useSharedValue(checked ? 1 : 0);
  const pop = useSharedValue(1);
  useEffect(() => {
    progress.value = withTiming(checked ? 1 : 0, { duration: 220 });
  }, [checked, progress]);

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['rgba(0,0,0,0)', palette.gold]),
    borderColor: interpolateColor(progress.value, [0, 1], [colors.border, palette.gold]),
    transform: [{ scale: pop.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.4 + progress.value * 0.6 }],
  }));
  const textStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value * 0.45 }));

  const onPressBox = () => {
    pop.value = withSequence(withTiming(0.82, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 260 }));
    onToggle(item.id);
  };

  const open = () => router.push(item.target as Href);

  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <Pressable
        onPress={onPressBox}
        hitSlop={HIT_SLOP}
        style={styles.boxHit}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={checked ? t('plan.markUndone', { title }) : t('plan.markDone', { title })}
      >
        <Animated.View style={[styles.box, boxStyle]}>
          <Animated.View style={checkStyle}>
            <Icon name="check" size={16} color={palette.navy} strokeWidth={2.75} />
          </Animated.View>
        </Animated.View>
      </Pressable>

      <PressableScale
        onPress={open}
        scaleTo={0.98}
        haptics={false}
        style={styles.rowBody}
        accessibilityRole="button"
        accessibilityLabel={t('plan.open', { title })}
      >
        <Animated.View style={[styles.flex, textStyle]}>
          <Text
            variant="bodyMedium"
            numberOfLines={2}
            style={checked ? styles.struck : undefined}
          >
            {title}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.kindIcon, { backgroundColor: withAlpha(color, isDark ? 0.24 : 0.12) }]}>
              <Icon name={KIND_ICON[item.kind]} size={11} color={color} mirrorInRTL={false} />
            </View>
            <Text variant="caption" color="muted" numberOfLines={1} style={styles.flexShrink}>
              {L(item.meta)}
            </Text>
            <Text variant="caption" color="muted">
              ·
            </Text>
            <Text variant="caption" color="muted" tabular>
              {t('plan.minutes', { count: item.minutes })}
            </Text>
          </View>
        </Animated.View>
        <Icon name="chevron" size={18} color={colors.muted} />
      </PressableScale>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.sm,
  },
  headBar: { flex: 1 },
  allDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    marginVertical: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    gap: space.md,
  },
  boxHit: {
    width: 32,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    marginTop: space.xs,
  },
  kindIcon: {
    width: 18,
    height: 18,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  struck: { textDecorationLine: 'line-through' },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
});
