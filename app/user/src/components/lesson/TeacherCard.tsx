import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Avatar, Card, Text } from '@/components/ui';
import { images } from '@/constants/images';
import { useI18n } from '@/hooks/useI18n';
import { space, useTheme } from '@/theme';
import { useTeachers } from '@/api/public';
import type { Localized, SubjectId } from '@/types';
import { formatNumber } from '@/utils/format';

export interface TeacherCardProps {
  name: Localized;
  subjectId: SubjectId;
  teacherId?: string | null;
  avatarUrl?: string | null;
}

/** Lesson teacher with rating / students from GET /public/teachers. */
export const TeacherCard = memo(function TeacherCard({ name, subjectId, teacherId, avatarUrl }: TeacherCardProps) {
  const { t, L, lang } = useI18n('lesson');
  const { colors } = useTheme();
  const { data: teachers } = useTeachers();
  const teacher =
    teachers?.find((x) => x.id === teacherId) ??
    teachers?.find((x) => x.subjectSlug === subjectId && (x.name.en === name.en || x.name.ar === name.ar));
  const rating = teacher?.rating ?? null;
  const students = teacher?.studentsCount ?? null;
  const avatar = avatarUrl ?? teacher?.avatarUrl ?? images.teacher;

  return (
    <Card style={styles.card}>
      <Avatar uri={avatar} name={L(name)} size={56} ring />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text variant="bodyBold" numberOfLines={1} style={styles.shrink}>
            {L(name)}
          </Text>
          <Icon name="check-circle" size={16} color={colors.accent} filled />
        </View>
        <Text variant="caption" color="muted">
          {t('teacher.subjectTeacher', { subject: t(`common:subjects.${subjectId}`) })}
        </Text>
        {rating !== null || students !== null ? (
          <View style={styles.stats}>
            {rating !== null ? (
              <View style={styles.stat}>
                <Icon name="star" size={14} color={colors.accent} filled />
                <Text variant="label" tabular>
                  {t('teacher.rating', { rating: rating.toFixed(1) })}
                </Text>
              </View>
            ) : null}
            {rating !== null && students !== null ? (
              <View style={[styles.dot, { backgroundColor: colors.border }]} />
            ) : null}
            {students !== null ? (
              <View style={styles.stat}>
                <Icon name="user" size={14} color={colors.muted} />
                <Text variant="label" color="muted" tabular>
                  {t('teacher.students', { value: formatNumber(students, lang) })}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  body: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shrink: { flexShrink: 1 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
