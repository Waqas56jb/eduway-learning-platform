import { memo, useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { palette, radius, space, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';

export interface QuestionNavigatorProps {
  total: number;
  /** 0-based index of the current question. */
  current: number;
  answered: Set<number> | boolean[];
  flagged: Set<number> | boolean[];
  onJump(i: number): void;
}

const CELL = 44;
const GAP = 10;

const has = (v: Set<number> | boolean[], i: number) => (v instanceof Set ? v.has(i) : !!v[i]);

/** Grid of numbered question cells: answered = gold, unanswered = outline, flagged = flag marker, current = ring. */
export const QuestionNavigator = memo(function QuestionNavigator({
  total,
  current,
  answered,
  flagged,
  onJump,
}: QuestionNavigatorProps) {
  const { colors, isDark } = useTheme();
  const { t, isAr } = useI18n('exams');
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);
  // 5–6 columns depending on available width.
  const columns = width >= 6 * CELL + 5 * GAP + 24 ? 6 : 5;
  const cellSize = width > 0 ? Math.max(CELL, Math.floor((width - GAP * (columns - 1)) / columns)) : CELL;

  return (
    <View>
      <View style={styles.legend}>
        <LegendItem label={t('navigator.answered')}>
          <View style={[styles.legendSwatch, { backgroundColor: colors.accent, borderColor: colors.accent }]} />
        </LegendItem>
        <LegendItem label={t('navigator.unanswered')}>
          <View style={[styles.legendSwatch, { borderColor: colors.border, backgroundColor: colors.surface }]} />
        </LegendItem>
        <LegendItem label={t('navigator.flagged')}>
          <Icon name="flag" size={14} color={colors.accent} filled />
        </LegendItem>
        <LegendItem label={t('navigator.current')}>
          <View style={[styles.legendSwatch, { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.surface }]} />
        </LegendItem>
      </View>

      <View style={[styles.grid, { gap: GAP }]} onLayout={onLayout}>
        {Array.from({ length: total }, (_, i) => {
          const isAnswered = has(answered, i);
          const isFlagged = has(flagged, i);
          const isCurrent = i === current;
          const states = [
            isAnswered ? t('navigator.cellAnswered') : t('navigator.cellUnanswered'),
            isFlagged ? t('navigator.cellFlagged') : null,
          ]
            .filter(Boolean)
            .join(isAr ? '، ' : ', ');
          return (
            <Animated.View key={i} entering={FadeIn.duration(200).delay(Math.min(i, 30) * 12)}>
              <PressableScale
                onPress={() => {
                  haptic.selection();
                  onJump(i);
                }}
                haptics={false}
                accessibilityRole="button"
                accessibilityState={{ selected: isCurrent }}
                accessibilityLabel={`${t('navigator.cell', { n: i + 1 })}, ${states}`}
                style={[
                  styles.cell,
                  {
                    width: cellSize,
                    height: CELL,
                    backgroundColor: isAnswered ? colors.accent : colors.surface,
                    borderColor: isAnswered ? colors.accent : colors.border,
                  },
                ]}
              >
                {isCurrent ? (
                  <View pointerEvents="none" style={[styles.ring, { borderColor: isDark ? colors.accentLight : colors.primary }]} />
                ) : null}
                <Text variant="label" tabular color={isAnswered ? palette.navy : colors.ink}>
                  {i + 1}
                </Text>
                {isFlagged ? (
                  <View style={[styles.flag, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
                    <Icon name="flag" size={10} color={colors.accent} filled />
                  </View>
                ) : null}
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
});

function LegendItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.legendItem}>
      {children}
      <Text variant="caption" color="muted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    marginBottom: space.lg,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    start: -4,
    end: -4,
    borderRadius: radius.sm + 4,
    borderWidth: 2,
  },
  flag: {
    position: 'absolute',
    top: -6,
    end: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
