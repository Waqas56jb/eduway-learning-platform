import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Avatar, IconButton, PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore, useNotificationsStore } from '@/store';
import { palette, radius, space, useTheme } from '@/theme';
import { formatDate } from '@/utils/format';

type DayPart = 'morning' | 'afternoon' | 'evening';

function dayPart(d: Date): DayPart {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

/** Avatar + time-of-day greeting + date, streak flame pill and notification bell. */
export const HomeHeader = memo(function HomeHeader() {
  const { colors, isDark } = useTheme();
  const { t, L, lang } = useI18n('home');
  const { width } = useWindowDimensions();
  const user = useAuthStore((s) => s.user);
  const unread = useNotificationsStore((s) => s.unreadCount());

  const now = useMemo(() => new Date(), []);
  const greeting = t(`greeting.${dayPart(now)}`, { name: L(user?.firstName) });
  const dateLabel = formatDate(now.toISOString(), lang, { weekday: 'long', day: 'numeric', month: 'long' });
  const streak = user?.streak ?? 0;
  const compact = width < 360;

  // Subtle "breathing" flame.
  const reduceMotion = useReducedMotion();
  const flame = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    flame.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [flame, reduceMotion]);
  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + flame.value * 0.14 }, { rotate: `${(flame.value - 0.5) * 10}deg` }, { translateY: -flame.value * 1.5 }],
  }));

  return (
    <View style={styles.row}>
      <PressableScale
        onPress={() => router.navigate('/(tabs)/profile')}
        accessibilityRole="button"
        accessibilityLabel={t('header.openProfile')}
        hitSlop={6}
      >
        <Avatar uri={user?.avatar} name={L(user?.name)} size={compact ? 44 : 48} ring />
      </PressableScale>

      <View style={styles.texts}>
        <Text variant="h3" display numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} accessibilityRole="header">
          {greeting}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {dateLabel}
        </Text>
      </View>

      <View
        style={[
          styles.streak,
          { backgroundColor: isDark ? 'rgba(201,162,74,0.16)' : colors.accentSoft, borderColor: isDark ? 'rgba(201,162,74,0.35)' : 'rgba(201,162,74,0.3)' },
        ]}
        accessible
        accessibilityLabel={t('header.streakLabel', { count: streak })}
      >
        <Animated.View style={flameStyle}>
          <Icon name="flame" size={16} color={streak > 0 ? '#F97316' : colors.muted} filled={streak > 0} />
        </Animated.View>
        <Text variant="label" color={isDark ? palette.goldLight : '#8A6A22'} tabular numberOfLines={1}>
          {compact ? String(streak) : t('header.streak', { count: streak })}
        </Text>
      </View>

      <IconButton
        icon="bell"
        variant="surface"
        badge={unread > 0 ? unread : undefined}
        onPress={() => router.push('/notifications')}
        accessibilityLabel={unread > 0 ? t('header.notificationsUnread', { count: unread }) : t('header.notifications')}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  texts: {
    flex: 1,
    marginStart: space.xs,
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: 34,
    paddingHorizontal: space.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
