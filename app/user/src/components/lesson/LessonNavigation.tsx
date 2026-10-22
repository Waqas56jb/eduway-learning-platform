import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, shadows, space, useTheme } from '@/theme';
import type { Lesson } from '@/types';

export interface LessonNavigationProps {
  prev?: Lesson;
  next?: Lesson;
  onNavigate: (lessonId: string) => void;
}

/** Previous / next lesson cards (subject order). Directional icons mirror under RTL. */
export const LessonNavigation = memo(function LessonNavigation({ prev, next, onNavigate }: LessonNavigationProps) {
  return (
    <View style={styles.row}>
      <NavCard lesson={prev} direction="prev" onPress={prev ? () => onNavigate(prev.id) : undefined} />
      <NavCard lesson={next} direction="next" onPress={next ? () => onNavigate(next.id) : undefined} />
    </View>
  );
});

function NavCard({ lesson, direction, onPress }: { lesson?: Lesson; direction: 'prev' | 'next'; onPress?: () => void }) {
  const { t, L } = useI18n('lesson');
  const { colors } = useTheme();
  const isNext = direction === 'next';
  const label = isNext ? t('actions.nextLesson') : t('actions.prevLesson');
  const title = lesson ? L(lesson.title) : isNext ? t('actions.lastLesson') : t('actions.firstLesson');

  return (
    <PressableScale
      onPress={onPress}
      disabled={!lesson}
      disabledOpacity={0.55}
      accessibilityRole="button"
      accessibilityLabel={lesson ? `${label}: ${title}` : title}
      style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.border }, isNext && styles.cardNext]}
    >
      <View style={[styles.head, isNext && styles.headNext]}>
        {!isNext ? <Icon name="back" size={16} color={colors.accent} /> : null}
        <Text variant="overline" color="accent">
          {isNext ? t('actions.next') : t('actions.prev')}
        </Text>
        {isNext ? <Icon name="chevron" size={16} color={colors.accent} /> : null}
      </View>
      <Text variant="label" numberOfLines={2} align={isNext ? 'end' : 'start'}>
        {title}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  card: {
    flex: 1,
    minHeight: 88,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  cardNext: { alignItems: 'flex-end' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headNext: { justifyContent: 'flex-end' },
});
