import { memo } from 'react';
import { I18nManager, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { SubjectIcon } from '@/components/icons';
import { PressableScale, ProgressRing, Text } from '@/components/ui';
import { subjects } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useProgressStore } from '@/store';
import { radius, SCREEN_PADDING, shadows, space, subjectColors, useTheme } from '@/theme';
import type { Subject } from '@/types';
import { withAlpha } from './color';

const TILE_WIDTH = 124;

/** Horizontal carousel of subject progress rings. */
export const SubjectCarousel = memo(function SubjectCarousel() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      decelerationRate="fast"
      snapToInterval={TILE_WIDTH + space.md}
      snapToAlignment="start"
    >
      {subjects.map((s, i) => (
        <Animated.View key={s.id} entering={(I18nManager.isRTL ? FadeInLeft : FadeInRight).duration(380).delay(120 + i * 60)}>
          <SubjectTile subject={s} />
        </Animated.View>
      ))}
    </ScrollView>
  );
});

const SubjectTile = memo(function SubjectTile({ subject }: { subject: Subject }) {
  const { colors, isDark } = useTheme();
  const { t, L } = useI18n('home');
  const pct = useProgressStore((s) => s.subjectCompletion(subject.id));
  const color = subjectColors[subject.id];
  const name = L(subject.name);

  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/subject/[id]', params: { id: subject.id } })}
      accessibilityRole="button"
      accessibilityLabel={t('subjects.a11y', { name, value: pct })}
      style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.sm]}
    >
      <View style={[styles.corner, { backgroundColor: withAlpha(color, isDark ? 0.2 : 0.1) }]} />
      <ProgressRing progress={pct} size={72} strokeWidth={7} color={color} trackColor={withAlpha(color, isDark ? 0.22 : 0.14)}>
        <View style={styles.ringCenter}>
          <SubjectIcon subjectId={subject.id} size={18} color={color} />
          <Text variant="caption" tabular style={styles.pct}>
            {`${pct}%`}
          </Text>
        </View>
      </ProgressRing>
      <Text variant="label" align="center" numberOfLines={1} style={styles.name}>
        {name}
      </Text>
      <Text variant="caption" color="muted" align="center" numberOfLines={1}>
        {t('subjects.lessons', { count: subject.lessonsCount })}
      </Text>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -SCREEN_PADDING },
  content: { paddingHorizontal: SCREEN_PADDING, gap: space.md, paddingVertical: space.xs },
  tile: {
    width: TILE_WIDTH,
    alignItems: 'center',
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    top: -36,
    end: -36,
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  pct: { marginTop: 1, fontSize: 11, lineHeight: 13 },
  name: { marginTop: space.md },
});
