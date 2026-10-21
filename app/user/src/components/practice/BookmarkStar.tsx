import { memo, useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { useI18n } from '@/hooks/useI18n';
import { useProgressStore } from '@/store';
import { HIT_SLOP, radius, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';

interface Props {
  questionId: string;
  size?: number;
  /** Render on a soft surface circle (session header) instead of bare. */
  surface?: boolean;
  onToggled?(bookmarked: boolean): void;
}

/** Animated bookmark star bound to progressStore.bookmarks. */
export const BookmarkStar = memo(function BookmarkStar({ questionId, size = 22, surface = false, onToggled }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n('practice');
  const bookmarked = useProgressStore((s) => s.bookmarks.includes(questionId));
  const toggleBookmark = useProgressStore((s) => s.toggleBookmark);
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    scale.value = withSequence(withTiming(1.35, { duration: 120 }), withSpring(1, { damping: 8, stiffness: 220 }));
    rotate.value = withSequence(withTiming(bookmarked ? -14 : 0, { duration: 120 }), withSpring(0, { damping: 10 }));
  }, [bookmarked, rotate, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  const onPress = useCallback(() => {
    const next = !bookmarked;
    toggleBookmark(questionId);
    if (next) haptic.success();
    else haptic.light();
    onToggled?.(next);
  }, [bookmarked, onToggled, questionId, toggleBookmark]);

  const box = surface ? 44 : Math.max(36, size + 14);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityState={{ selected: bookmarked }}
      accessibilityLabel={bookmarked ? t('bank.bookmarkRemove') : t('bank.bookmarkAdd')}
      style={[
        styles.base,
        { width: box, height: box },
        surface && {
          backgroundColor: bookmarked ? colors.accentSoft : colors.surfaceMuted,
          borderColor: bookmarked ? colors.accent : colors.border,
          borderWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Animated.View style={animStyle}>
        <Icon name="star" size={size} color={bookmarked ? colors.accent : colors.muted} filled={bookmarked} />
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
});
