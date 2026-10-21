import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, SubjectIcon } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import type { Attempt } from '@/store';
import { radius, space, subjectColors, useTheme } from '@/theme';
import { timeAgo } from '@/utils/format';

interface Props {
  attempt: Attempt;
  onPress(attempt: Attempt): void;
}

export const RecentAttemptRow = memo(function RecentAttemptRow({ attempt, onPress }: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n('practice');
  const color = attempt.subjectId ? subjectColors[attempt.subjectId] : colors.accent;
  const scoreColor = attempt.score >= 80 ? colors.success : attempt.score >= 50 ? colors.warning : colors.danger;
  const title = attempt.subjectId ? t(`common:subjects.${attempt.subjectId}`) : t('recent.mixed');
  const when = timeAgo(attempt.date, lang);

  return (
    <PressableScale
      onPress={() => onPress(attempt)}
      accessibilityRole="button"
      accessibilityLabel={t('recent.a11y', { title, score: attempt.score, when })}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.icon, { backgroundColor: `${color}1F` }]}>
        {attempt.subjectId ? (
          <SubjectIcon subjectId={attempt.subjectId} size={20} color={color} />
        ) : (
          <Icon name="practice" size={20} color={color} />
        )}
      </View>
      <View style={styles.flex}>
        <Text variant="bodyBold" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {t('recent.attempt', { n: attempt.attemptNo })} · {t('recent.score', { correct: attempt.correct, total: attempt.total })} · {when}
        </Text>
      </View>
      <View style={[styles.score, { backgroundColor: `${scoreColor}1A` }]}>
        <Text variant="label" color={scoreColor} tabular>
          {t('common:units.percent', { value: attempt.score })}
        </Text>
      </View>
      <Icon name="chevron" size={16} color={colors.muted} />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 64,
  },
  icon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: space.xxs },
  score: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill },
});
