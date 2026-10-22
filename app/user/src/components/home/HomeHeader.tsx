import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Avatar, IconButton, PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useUnreadCount } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { space } from '@/theme';
import { formatDate } from '@/utils/format';

type DayPart = 'morning' | 'afternoon' | 'evening';

function dayPart(d: Date): DayPart {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

const AVATAR = 48;

/** Header row: avatar · greeting stacked over today's date · notifications bell — all centered on one axis. */
export const HomeHeader = memo(function HomeHeader() {
  const { t, L, lang } = useI18n('home');
  const user = useAuthStore((s) => s.user);
  const unread = useUnreadCount().data ?? 0;

  const now = useMemo(() => new Date(), []);
  const greeting = t(`greeting.${dayPart(now)}`, { name: L(user?.firstName) });
  const dateLabel = formatDate(now.toISOString(), lang, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <View style={styles.row}>
      <PressableScale
        onPress={() => router.navigate('/(tabs)/profile')}
        accessibilityRole="button"
        accessibilityLabel={t('header.openProfile')}
        hitSlop={8}
        scaleTo={0.94}
      >
        <Avatar uri={user?.avatar || undefined} name={L(user?.name)} size={AVATAR} ring />
      </PressableScale>

      <View style={styles.texts}>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {dateLabel}
        </Text>
        <Text
          variant="h2"
          display
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          accessibilityRole="header"
        >
          {greeting}
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
    gap: space.md,
    minHeight: AVATAR,
  },
  texts: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
});
