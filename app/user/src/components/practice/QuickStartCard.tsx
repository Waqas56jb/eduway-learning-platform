import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon, SubjectIcon } from '@/components/icons';
import { PressableScale, ProgressBar, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, shadows, space, subjectColors } from '@/theme';
import type { Subject } from '@/types';

interface Props {
  subject: Subject;
  count: number;
  mastery: number;
  locked?: boolean;
  index?: number;
  onPress(subject: Subject): void;
}

/** Colored subject tile for one-tap practice. */
export const QuickStartCard = memo(function QuickStartCard({ subject, count, mastery, locked, index = 0, onPress }: Props) {
  const { t } = useI18n('practice');
  const color = subjectColors[subject.id];
  const name = t(`common:subjects.${subject.id}`);
  const questionsLabel = t('common:units.questions', { count });

  return (
    <Animated.View entering={FadeInDown.duration(260).delay(index * 50)}>
      <PressableScale
        onPress={() => onPress(subject)}
        accessibilityRole="button"
        accessibilityLabel={t('quickStart.a11y', { subject: name, questions: questionsLabel, value: mastery })}
        style={[styles.card, shadows.md]}
      >
        <LinearGradient colors={[color, shade(color)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.glow} />
        <View style={styles.top}>
          <View style={styles.iconWrap}>
            <SubjectIcon subjectId={subject.id} size={22} color="#FFFFFF" />
          </View>
          {locked ? (
            <View style={styles.lock}>
              <Icon name="lock" size={14} color="#FFFFFF" />
            </View>
          ) : (
            <Icon name="arrow" size={18} color="rgba(255,255,255,0.9)" />
          )}
        </View>
        <View style={styles.bottom}>
          <Text variant="h3" color="#FFFFFF" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" color="rgba(255,255,255,0.85)">
            {locked ? t('quickStart.locked') : questionsLabel}
          </Text>
          <View style={styles.mastery}>
            <ProgressBar progress={mastery} height={4} color="#FFFFFF" trackColor="rgba(255,255,255,0.25)" />
            <Text variant="caption" color="#FFFFFF" tabular>
              {t('quickStart.mastery', { value: mastery })}
            </Text>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
});

/** Darken a hex color ~30% for the gradient tail. */
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * 0.68));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const styles = StyleSheet.create({
  card: {
    width: 168,
    height: 196,
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: space.lg,
    justifyContent: 'space-between',
  },
  glow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    top: -60,
    end: -50,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lock: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { gap: space.xxs },
  mastery: { gap: space.xs, marginTop: space.sm },
});
