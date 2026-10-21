import { memo, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
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

/** Friendly empty / zero state with a gently floating illustration. */
export const EmptyState = memo(function EmptyState({ icon = 'sparkles', title, message, actionLabel, onAction, style }: EmptyStateProps) {
  const { colors, isDark } = useTheme();
  const float = useSharedValue(0);

  useEffect(() => {
    float.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(float);
  }, [float]);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 + float.value * 12 }] }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + float.value * 0.45,
    transform: [{ scale: 0.96 + float.value * 0.08 }],
  }));

  const iconColor = isDark ? colors.accentLight : colors.accent;

  return (
    <Animated.View entering={FadeInDown.duration(300)} style={[styles.container, style]}>
      <View style={styles.illustration}>
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
  message: { maxWidth: 300 },
  action: { marginTop: space.xl, minWidth: 180 },
});
