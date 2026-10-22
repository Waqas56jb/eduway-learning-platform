import { memo, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { space, useTheme } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Friendly empty / zero state with an illustration that springs in once. */
export const EmptyState = memo(function EmptyState({ icon = 'sparkles', title, message, actionLabel, onAction, style }: EmptyStateProps) {
  const { colors, isDark } = useTheme();
  // One-shot entrance (no perpetual animation): halo blooms, circle springs in.
  const enter = useSharedValue(0);
  const halo = useSharedValue(0);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 14, stiffness: 180, mass: 0.8 });
    halo.value = withDelay(120, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [enter, halo]);

  const floatStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.5),
    transform: [{ scale: 0.7 + enter.value * 0.3 }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: halo.value,
    transform: [{ scale: 0.8 + halo.value * 0.2 }],
  }));

  const iconColor = isDark ? colors.accentLight : colors.accent;

  return (
    <Animated.View entering={FadeInDown.duration(300)} style={[styles.container, style]}>
      <View style={styles.illustration} pointerEvents="none">
        <Animated.View style={[styles.halo, { backgroundColor: colors.accentSoft }, haloStyle]} />
        <Animated.View
          style={[
            styles.circle,
            { backgroundColor: colors.accentSoft, borderColor: isDark ? 'rgba(201,162,74,0.35)' : 'rgba(201,162,74,0.28)' },
            floatStyle,
          ]}
        >
          <View style={[styles.inner, { backgroundColor: colors.surface }]}>
            <Icon name={icon} size={34} color={iconColor} strokeWidth={1.6} />
          </View>
        </Animated.View>
      </View>
      <Text variant="h3" align="center" style={styles.title}>
        {title}
      </Text>
      {message ? (
        <Text variant="body" color="muted" align="center" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} size="md" style={styles.action} />
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.huge, paddingHorizontal: space.xxl },
  illustration: { width: 148, height: 148, alignItems: 'center', justifyContent: 'center', marginBottom: space.xl },
  halo: { position: 'absolute', width: 148, height: 148, borderRadius: 74 },
  circle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  title: { marginBottom: space.sm },
  message: { maxWidth: 320 },
  action: { marginTop: space.xl, minWidth: 180 },
});
