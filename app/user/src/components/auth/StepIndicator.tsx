import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/ui';
import { gradients, palette, space } from '@/theme';

interface StepIndicatorProps {
  current: number;
  total: number;
  label: string;
  /** Short caption next to the counter (e.g. "Your details"). */
  caption?: string;
}

/** Centered "Step 1 of 2 · Your details" with slim segmented bars, drawn on the navy hero. */
export function StepIndicator({ current, total, label, caption }: StepIndicatorProps) {
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={caption ? `${label}, ${caption}` : label}
      accessibilityValue={{ min: 0, max: total, now: current }}
    >
      <View style={styles.bars}>
        {Array.from({ length: total }, (_, i) => {
          const done = i < current;
          return (
            <View key={i} style={[styles.bar, !done && styles.barIdle]}>
              {done ? (
                <LinearGradient
                  colors={gradients.gold}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      <View style={styles.labels}>
        <Text variant="label" color={palette.goldLight}>
          {label}
        </Text>
        {caption ? (
          <>
            <View style={styles.dot} />
            <Text variant="label" color="rgba(255,255,255,0.72)">
              {caption}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', width: '100%', maxWidth: 240, gap: space.sm + 2, alignItems: 'center' },
  bars: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' },
  bar: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  barIdle: { backgroundColor: 'rgba(255,255,255,0.18)' },
  labels: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.45)' },
});
