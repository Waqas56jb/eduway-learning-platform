import { memo, useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { useI18n } from '@/hooks/useI18n';
import { useBookmarkIds, useToggleBookmark } from '@/api/bank';
import { HIT_SLOP, radius, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';

interface Props {
  questionId: string;
  size?: number;
  /** Render on a soft surface circle (session header) instead of bare. */
  surface?: boolean;
  onToggled?(bookmarked: boolean): void;
  /** Server-provided state used until the bookmark id list (BMK-02) has loaded. */
  initial?: boolean;
}

/** Animated bookmark star bound to the server bookmark list (BMK-02/03/04, optimistic). */
export const BookmarkStar = memo(function BookmarkStar({ questionId, size = 22, surface = false, onToggled, initial }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n('practice');
  const { data: ids } = useBookmarkIds();
  const bookmarked = ids ? ids.includes(questionId) : !!initial;
  const { mutate: toggle } = useToggleBookmark();
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
    toggle({ questionId, bookmarked: next });
    if (next) haptic.success();
    else haptic.light();
    onToggled?.(next);
  }, [bookmarked, onToggled, questionId, toggle]);

  const box = Math.max(44, size + 16);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityState={{ selected: bookmarked }}
      accessibilityLabel={bookmarked ? t('bank.bookmarkRemove') : t('bank.bookmarkAdd')}
      style={({ pressed }) => [
        styles.base,
        { width: box, height: box },
        surface && {
          backgroundColor: bookmarked ? colors.accentSoft : colors.surfaceMuted,
          borderColor: bookmarked ? colors.accent : colors.border,
          borderWidth: StyleSheet.hairlineWidth,
        },
        pressed && styles.pressed,
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
  pressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
});
