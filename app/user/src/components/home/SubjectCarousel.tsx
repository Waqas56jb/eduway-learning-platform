import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { SubjectIcon } from '@/components/icons';
import { PressableScale, ProgressBar, Text } from '@/components/ui';
import { toSubject, useSubjects } from '@/api';
import { useI18n } from '@/hooks/useI18n';
import { radius, SCREEN_PADDING, shadows, space, subjectColors, useTheme } from '@/theme';
import type { Subject } from '@/types';
import { withAlpha } from './color';

const GAP = space.md;
/** Cards visible per viewport — the fraction gives a "peek" of the next card. */
const VISIBLE = 2.35;

/**
 * Horizontal, snap-scrolling subject progress carousel. Card width is computed from the window width.
 * Native RTL mirrors the horizontal ScrollView, so it starts at the right edge in Arabic without manual flipping.
 */
export const SubjectCarousel = memo(function SubjectCarousel() {
  const { width } = useWindowDimensions();
  const cardWidth = Math.round(
    Math.min(172, Math.max(120, (width - SCREEN_PADDING * 2 - GAP * (Math.ceil(VISIBLE) - 1)) / VISIBLE)),
  );
  const { data } = useSubjects();
  const subjects = useMemo(() => (data ?? []).map(toSubject), [data]);
  const offsets = useMemo(() => subjects.map((_, i) => i * (cardWidth + GAP)), [cardWidth, subjects]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      decelerationRate="fast"
      snapToOffsets={offsets}
      snapToEnd={false}
      disableIntervalMomentum
    >
      {subjects.map((s) => (
        <SubjectTile key={s.id} subject={s} width={cardWidth} />
      ))}
    </ScrollView>
  );
});

const SubjectTile = memo(function SubjectTile({ subject, width }: { subject: Subject; width: number }) {
  const { colors, isDark } = useTheme();
  const { t, L } = useI18n('home');
  const pct = Math.round(subject.progressPct ?? 0);
  const color = subjectColors[subject.id] ?? subject.color;
  const name = L(subject.name);

  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/subject/[id]', params: { id: subject.id } })}
      accessibilityRole="button"
      accessibilityLabel={t('subjects.a11y', { name, value: pct })}
      style={[
        styles.tile,
        { width, backgroundColor: colors.surface, borderColor: colors.border },
        !isDark && shadows.sm,
      ]}
    >
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: withAlpha(color, isDark ? 0.24 : 0.12) }]}>
          <SubjectIcon subjectId={subject.id} size={20} color={color} />
        </View>
        <Text variant="h3" display tabular numberOfLines={1} style={styles.pct}>
          {`${pct}%`}
        </Text>
      </View>
      <Text variant="bodyBold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={styles.name}>
        {name}
      </Text>
      <Text variant="caption" color="muted" numberOfLines={1}>
        {t('subjects.lessons', { count: subject.lessonsCount })}
      </Text>
      <View style={styles.bar}>
        <ProgressBar progress={pct} height={5} color={color} trackColor={withAlpha(color, isDark ? 0.22 : 0.12)} />
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -SCREEN_PADDING },
  content: { paddingHorizontal: SCREEN_PADDING, gap: GAP, paddingTop: space.xs, paddingBottom: space.sm },
  tile: {
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: space.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pct: { flexShrink: 1 },
  name: { marginBottom: 2 },
  bar: { marginTop: space.md },
});
