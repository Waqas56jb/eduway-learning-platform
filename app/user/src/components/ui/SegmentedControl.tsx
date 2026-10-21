import { memo, useCallback, useEffect, useState } from 'react';
import { I18nManager, Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useLangStore } from '@/store/langStore';
import { fontFor, radius, shadows, useTheme } from '@/theme';
import { formatNumber } from '@/utils/format';
import { haptic } from '@/utils/haptics';
import { Text } from './Text';

export interface SegmentedOption {
  key: string;
  label: string;
  count?: number;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
  /** Track height (default 44). */
  height?: number;
}

const PAD = 4;
const SPRING = { damping: 20, stiffness: 220, mass: 0.8 } as const;

/** Segmented control with a sliding pill indicator (RTL aware). Also exported as `Tabs`. */
export const SegmentedControl = memo(function SegmentedControl({ options, value, onChange, style, height = 44 }: SegmentedControlProps) {
  const { colors, isDark } = useTheme();
  const isAr = useLangStore((s) => s.isAr);
  const lang = useLangStore((s) => s.lang);
  const [width, setWidth] = useState(0);
  const count = Math.max(options.length, 1);
  const segW = width > 0 ? (width - PAD * 2) / count : 0;
  const index = Math.max(
    0,
    options.findIndex((o) => o.key === value),
  );

  const translate = useSharedValue(0);
  const ready = useSharedValue(0);
  const dir = I18nManager.isRTL ? -1 : 1;

  useEffect(() => {
    if (segW <= 0) return;
    const target = index * segW * dir;
    if (ready.value === 0) {
      translate.value = target;
      ready.value = 1;
    } else {
      translate.value = withSpring(target, SPRING);
    }
  }, [index, segW, dir, translate, ready]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: ready.value,
    transform: [{ translateX: translate.value }],
  }));

  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);

  return (
    <View
      onLayout={onLayout}
      accessibilityRole="tablist"
      style={[styles.track, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, height }, style]}
    >
      {segW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: segW,
              height: height - PAD * 2,
              backgroundColor: isDark ? colors.surfaceElevated : colors.surface,
              borderColor: isDark ? 'rgba(201,162,74,0.35)' : 'rgba(201,162,74,0.25)',
            },
            isDark ? null : shadows.sm,
            indicatorStyle,
          ]}
        />
      ) : null}
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (selected) return;
              haptic.selection();
              onChange(o.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={typeof o.count === 'number' ? `${o.label}, ${formatNumber(o.count, lang)}` : o.label}
            style={styles.segment}
          >
            <Text
              variant="label"
              color={selected ? colors.ink : colors.muted}
              numberOfLines={1}
              style={{ fontFamily: fontFor(selected ? 'bold' : 'medium', isAr) }}
            >
              {o.label}
            </Text>
            {typeof o.count === 'number' ? (
              <View
                style={[
                  styles.count,
                  { backgroundColor: selected ? colors.accent : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(11,31,58,0.07)' },
                ]}
              >
                <Text
                  variant="caption"
                  tabular
                  color={selected ? colors.onAccent : colors.muted}
                  style={[styles.countText, { fontFamily: fontFor('bold', isAr) }]}
                >
                  {formatNumber(o.count, lang)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
});

/** Alias for tab-like usage. */
export const Tabs = SegmentedControl;

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: PAD,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  indicator: {
    position: 'absolute',
    top: PAD,
    start: PAD,
    borderRadius: radius.md - PAD,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  count: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 11, lineHeight: 14 },
});
