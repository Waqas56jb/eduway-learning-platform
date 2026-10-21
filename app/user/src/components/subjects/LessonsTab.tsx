import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Button, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { palette, radius, space, subjectColors } from '@/theme';
import type { Lesson, Subject } from '@/types';
import { UnitAccordion } from './UnitAccordion';

export interface LessonsTabProps {
  subject: Subject;
  lessons: Lesson[];
  locked: boolean;
  /** Unit that holds the "continue" lesson — opened by default. */
  activeUnitId?: string;
}

export function LessonsTab({ subject, lessons, locked, activeUnitId }: LessonsTabProps) {
  const color = subjectColors[subject.id];
  const byUnit = useMemo(() => {
    const map: Record<string, Lesson[]> = {};
    for (const l of lessons) (map[l.unitId] ??= []).push(l);
    return map;
  }, [lessons]);

  return (
    <View style={styles.wrap}>
      {locked ? <UpsellCard subject={subject} /> : null}
      {subject.units.map((unit, i) => (
        <Animated.View key={unit.id} entering={FadeInDown.duration(260).delay(i * 60)}>
          <UnitAccordion
            unit={unit}
            index={i}
            lessons={byUnit[unit.id] ?? []}
            color={color}
            locked={locked}
            defaultOpen={activeUnitId ? unit.id === activeUnitId : i === 0}
          />
        </Animated.View>
      ))}
    </View>
  );
}

export function UpsellCard({ subject }: { subject: Subject }) {
  const { t, L } = useI18n(['subjects', 'common']);
  return (
    <Animated.View entering={FadeInDown.duration(280)} style={styles.upsell}>
      <LinearGradient colors={['#15325C', '#0B1F3A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.upsellRow}>
        <View style={styles.crown}>
          <Icon name="crown" size={22} color={palette.navy} />
        </View>
        <View style={styles.flex}>
          <Text variant="h3" color="#FFFFFF">
            {t('subjects:detail.upsellTitle', { name: L(subject.name) })}
          </Text>
          <Text variant="caption" color="rgba(255,255,255,0.75)">
            {t('subjects:detail.upsellMessage')}
          </Text>
        </View>
      </View>
      <Button
        title={t('subjects:detail.upsellCta')}
        variant="primary"
        size="md"
        icon="crown"
        fullWidth
        onPress={() => router.push('/subscription')}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 4 },
  wrap: { gap: space.md },
  upsell: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: space.lg,
    gap: space.lg,
    borderWidth: 1,
    borderColor: 'rgba(201,162,74,0.55)',
  },
  upsellRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  crown: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
