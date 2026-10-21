import { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { SubjectIcon } from '@/components/icons';
import { PressableScale, ProgressRing, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, SCREEN_PADDING, shadows, space, subjectColors, useTheme } from '@/theme';
import type { Subject } from '@/types';

interface SubjectRingsProps {
  items: { subject: Subject; completion: number }[];
}

const CARD_WIDTH = 116;

/** Horizontal carousel of per-subject completion rings; tap opens the subject. */
export const SubjectRings = memo(function SubjectRings({ items }: SubjectRingsProps) {
  const { colors, isDark } = useTheme();
  const { t, L } = useI18n('progress');

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={CARD_WIDTH + space.md}
      contentContainerStyle={styles.content}
      style={styles.scroller}
    >
      {items.map(({ subject, completion }, i) => {
        const color = subjectColors[subject.id];
        const name = L(subject.name);
        return (
          <Animated.View key={subject.id} entering={FadeInDown.duration(320).delay(120 + i * 60)}>
            <PressableScale
              onPress={() => router.push({ pathname: '/subject/[id]', params: { id: subject.id } })}
              accessibilityRole="button"
              accessibilityLabel={t('subjects.a11y', { subject: name, value: completion })}
              style={[
                styles.card,
                isDark ? null : shadows.sm,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={[styles.tint, { backgroundColor: color, opacity: isDark ? 0.14 : 0.08 }]} />
              <ProgressRing progress={completion} size={72} strokeWidth={7} color={color} trackColor={colors.surfaceMuted} />
              <View style={styles.nameRow}>
                <SubjectIcon subjectId={subject.id} size={14} color={color} />
                <Text variant="label" numberOfLines={1} style={styles.name}>
                  {name}
                </Text>
              </View>
            </PressableScale>
          </Animated.View>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroller: { marginHorizontal: -SCREEN_PADDING },
  content: { paddingHorizontal: SCREEN_PADDING, gap: space.md, paddingVertical: space.xs },
  card: {
    width: CARD_WIDTH,
    alignItems: 'center',
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    gap: space.md,
  },
  tint: { position: 'absolute', top: 0, start: 0, end: 0, height: 56 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, maxWidth: '100%' },
  name: { flexShrink: 1 },
});
