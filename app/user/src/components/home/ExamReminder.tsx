import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Icon } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { upcomingExams } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { gradients, palette, radius, shadows, space } from '@/theme';
import { formatDate } from '@/utils/format';

const DAY_MS = 86400000;

/** Whole calendar days from today to the exam date (0 = today). */
function daysUntil(iso: string, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d = new Date(iso);
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

/** Navy reminder card for the next upcoming exam with a day countdown. */
export const ExamReminder = memo(function ExamReminder() {
  const { t, L, lang } = useI18n('home');
  const exam = upcomingExams[0];
  const now = useMemo(() => new Date(), []);
  if (!exam) return null;

  const days = daysUntil(exam.date, now);
  const when = t('exam.in', { count: days });
  const title = L(exam.title);
  const time = formatDate(exam.date, lang, { weekday: 'long', hour: 'numeric', minute: '2-digit' });

  return (
    <PressableScale
      onPress={() => router.push('/exams')}
      accessibilityRole="button"
      accessibilityLabel={t('exam.a11y', { title, when })}
      style={[styles.wrap, shadows.lg]}
    >
      <LinearGradient colors={gradients.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.ring} pointerEvents="none" />
        <View style={styles.dateTile}>
          <Text variant="h1" display tabular color={palette.gold} align="center" style={styles.dateNum}>
            {formatDate(exam.date, lang, { day: 'numeric' })}
          </Text>
          <Text variant="overline" color="rgba(255,255,255,0.75)" align="center" numberOfLines={1}>
            {formatDate(exam.date, lang, { month: 'short' })}
          </Text>
        </View>

        <View style={styles.flex}>
          <View style={styles.overRow}>
            <Icon name="calendar" size={12} color={palette.goldLight} />
            <Text variant="overline" color={palette.goldLight} numberOfLines={1}>
              {t('exam.overline')}
            </Text>
          </View>
          <Text variant="bodyBold" color="onPrimary" numberOfLines={2} style={styles.title}>
            {title}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.countdown}>
              <Icon name="timer" size={13} color={palette.navy} />
              <Text variant="label" color={palette.navy} numberOfLines={1}>
                {when}
              </Text>
            </View>
            <Text variant="caption" color="rgba(255,255,255,0.7)" numberOfLines={1} style={styles.flexShrink}>
              {time}
            </Text>
          </View>
        </View>

        <Icon name="chevron" size={20} color="rgba(255,255,255,0.6)" />
      </LinearGradient>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    end: -40,
    bottom: -60,
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 18,
    borderColor: 'rgba(201,162,74,0.10)',
  },
  dateTile: {
    width: 56,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201,162,74,0.45)',
  },
  dateNum: { lineHeight: 32 },
  overRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  title: { marginVertical: 2 },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: palette.gold,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  flexShrink: { flexShrink: 1 },
  flex: { flex: 1 },
});
