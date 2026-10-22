import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { space } from '@/theme';
import { ProgressBar } from '../ProgressBar';
import { Text } from '../Text';

export interface BarListItem {
  label: string;
  /** 0–100 */
  value: number;
  color?: string;
  /** Optional right-side text instead of `${value}%`. */
  valueLabel?: string;
}

export interface BarListProps {
  items: BarListItem[];
  /** Bar thickness (default 8). */
  barHeight?: number;
  style?: StyleProp<ViewStyle>;
}

/** Horizontal labeled bars with percentage values; fills from the start edge (RTL aware). */
export const BarList = memo(function BarList({ items, barHeight = 8, style }: BarListProps) {
  return (
    <View style={[styles.list, style]}>
      {items.map((item, i) => {
        const v = Math.max(0, Math.min(100, Math.round(item.value)));
        return (
          <Animated.View key={`${item.label}-${i}`} entering={FadeInDown.duration(250).delay(i * 50)} style={styles.row}>
            <View style={styles.head}>
              <Text variant="label" color="ink" numberOfLines={1} style={styles.label}>
                {item.label}
              </Text>
              <Text variant="label" color={item.color ?? 'accent'} tabular>
                {item.valueLabel ?? `${v}%`}
              </Text>
            </View>
            <ProgressBar
              progress={v}
              height={barHeight}
              color={item.color}
              gradient={!item.color}
              delay={120 + i * 90}
              accessibilityLabel={`${item.label} ${v}%`}
            />
          </Animated.View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  list: { gap: space.lg },
  row: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  label: { flex: 1 },
});
