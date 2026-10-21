import { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { LessonRow } from '@/components/student';
import { PressableScale, ProgressRing, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useProgressStore } from '@/store';
import { radius, shadows, space, useTheme } from '@/theme';
import type { Lesson, Unit } from '@/types';

export interface UnitAccordionProps {
  unit: Unit;
  index: number;
  lessons: Lesson[];
  color: string;
  locked: boolean;
  defaultOpen?: boolean;
}

const TIMING = { duration: 280, easing: Easing.out(Easing.cubic) };

/** Expandable unit → chapter → lesson group with an animated height and rotating chevron. */
export const UnitAccordion = memo(function UnitAccordion({
  unit,
  index,
  lessons,
  color,
  locked,
  defaultOpen = false,
}: UnitAccordionProps) {
  const { colors, isDark } = useTheme();
  const { t, L } = useI18n('subjects');
  const lessonProgress = useProgressStore((s) => s.lessonProgress);
  const [open, setOpen] = useState(defaultOpen);
  const openSV = useSharedValue(defaultOpen ? 1 : 0);
  const contentH = useSharedValue(0);

  const { pct, done } = useMemo(() => {
    if (!lessons.length) return { pct: 0, done: 0 };
    let sum = 0;
    let d = 0;
    for (const l of lessons) {
      const p = lessonProgress[l.id];
      if (p?.status === 'completed') {
        sum += 100;
        d += 1;
      } else sum += p?.progress ?? 0;
    }
    return { pct: Math.round(sum / lessons.length), done: d };
  }, [lessons, lessonProgress]);

  const chapters = useMemo(
    () =>
      unit.chapters
        .map((c, i) => ({ chapter: c, n: i + 1, items: lessons.filter((l) => l.chapterId === c.id) }))
        .filter((c) => c.items.length > 0),
    [unit.chapters, lessons],
  );

  const toggle = useCallback(() => {
    openSV.value = withTiming(open ? 0 : 1, TIMING);
    setOpen(!open);
  }, [open, openSV]);

  const onContentLayout = useCallback(
    (e: LayoutChangeEvent) => {
      contentH.value = e.nativeEvent.layout.height;
    },
    [contentH],
  );

  const bodyStyle = useAnimatedStyle(() => ({ height: contentH.value * openSV.value, opacity: 0.2 + openSV.value * 0.8 }));
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${openSV.value * 180}deg` }] }));

  return (
    <View style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <PressableScale
        onPress={toggle}
        scaleTo={0.99}
        style={styles.head}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${t('lessons.unit', { n: index + 1 })}, ${L(unit.title)}, ${open ? t('lessons.collapse') : t('lessons.expand')}`}
      >
        <ProgressRing
          progress={locked ? 0 : pct}
          size={48}
          strokeWidth={4}
          color={color}
          trackColor={isDark ? 'rgba(255,255,255,0.1)' : colors.surfaceMuted}
          label={locked ? '' : `${pct}%`}
        >
          {locked ? <Icon name="lock" size={16} color={colors.muted} /> : undefined}
        </ProgressRing>
        <View style={styles.headText}>
          <Text variant="overline" color={color}>
            {t('lessons.unit', { n: index + 1 })}
          </Text>
          <Text variant="bodyBold" numberOfLines={2}>
            {L(unit.title)}
          </Text>
          <Text variant="caption" color="muted">
            {t('lessons.progress', { done, total: lessons.length })}
          </Text>
        </View>
        <Animated.View style={[styles.chevron, { backgroundColor: colors.surfaceMuted }, chevronStyle]}>
          <Icon name="chevron-down" size={18} color={colors.ink} />
        </Animated.View>
      </PressableScale>

      <Animated.View style={[styles.bodyClip, bodyStyle]} pointerEvents={open ? 'auto' : 'none'}>
        <View style={styles.bodyInner} onLayout={onContentLayout}>
          {chapters.map(({ chapter, n, items }) => (
            <View key={chapter.id} style={styles.chapter}>
              <View style={styles.chapterHead}>
                <View style={[styles.chapterDot, { backgroundColor: color }]} />
                <Text variant="label" color="muted" numberOfLines={1} style={styles.flex}>
                  {`${t('lessons.chapter', { n })} · ${L(chapter.title)}`}
                </Text>
              </View>
              {items.map((lesson, i) => (
                <View key={lesson.id}>
                  {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                  <LessonRow lesson={lesson} locked={locked} showTeacher={false} />
                </View>
              ))}
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  headText: { flex: 1, gap: 2 },
  chevron: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  bodyClip: { overflow: 'hidden' },
  bodyInner: { position: 'absolute', top: 0, start: 0, end: 0, paddingHorizontal: space.lg, paddingBottom: space.md },
  chapter: { paddingTop: space.xs },
  chapterHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  chapterDot: { width: 6, height: 6, borderRadius: 3 },
  divider: { height: StyleSheet.hairlineWidth, marginStart: 92 + space.md },
});
