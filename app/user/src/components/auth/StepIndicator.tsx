import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { palette, space } from '@/theme';

interface StepIndicatorProps {
  current: number;
  total: number;
  label: string;
  /** Short caption next to the counter (e.g. "Your details"). */
  caption?: string;
}

/** "Step 1 of 2" pill + segmented bar, drawn on the navy hero. */
export function StepIndicator({ current, total, label, caption }: StepIndicatorProps) {
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={caption ? `${label}, ${caption}` : label}
      accessibilityValue={{ min: 0, max: total, now: current }}
    >
      <View style={styles.labels}>
        <Text variant="overline" color={palette.goldLight}>
          {label}
        </Text>
        {caption ? (
          <Text variant="caption" color="rgba(255,255,255,0.7)">
            {caption}
          </Text>
        ) : null}
      </View>
      <View style={styles.bars}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[styles.bar, { backgroundColor: i < current ? palette.gold : 'rgba(255,255,255,0.18)' }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  labels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bars: { flexDirection: 'row', gap: space.xs },
  bar: { flex: 1, height: 4, borderRadius: 2 },
});
