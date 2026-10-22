import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import type { Session } from '@/types';
import { HIT_SLOP, radius, space, useTheme } from '@/theme';
import { timeAgo } from '@/utils/format';
import { haptic } from '@/utils/haptics';
import { ROW_PADDING } from './SettingsRow';

export interface SessionRowProps {
  session: Session;
  onLogout?: (session: Session) => void;
}

export const SESSION_ICON = 40;
/** Separator inset for session lists (aligned to the device name). */
export const SESSION_TEXT_INSET = ROW_PADDING + SESSION_ICON + space.md;

function deviceIcon(device: string): IconName {
  const d = device.toLowerCase();
  if (d.includes('iphone') || d.includes('android') || d.includes('app')) return 'phone';
  return 'devices';
}

/** One signed-in device: name, location · last active, and a sign-out action at the end edge (non-current only). */
export const SessionRow = memo(function SessionRow({ session, onLogout }: SessionRowProps) {
  const { t, L, lang } = useI18n('settings');
  const { colors, isDark } = useTheme();
  const current = session.current;

  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: current ? colors.successSoft : colors.surfaceMuted }]}>
        <Icon name={deviceIcon(session.device)} size={20} color={current ? colors.success : colors.muted} strokeWidth={2} />
      </View>
      <View style={styles.body}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {session.device}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {`${L(session.location)} · ${current ? t('sessions.activeNow') : t('sessions.lastActive', { time: timeAgo(session.lastActive, lang) })}`}
        </Text>
      </View>
      {current ? (
        <View style={[styles.pill, { backgroundColor: colors.successSoft }]}>
          <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
          <Text variant="label" color={colors.success} numberOfLines={1} style={styles.pillText}>
            {t('sessions.thisDevice')}
          </Text>
        </View>
      ) : onLogout ? (
        <Pressable
          onPressIn={() => haptic.light()}
          onPress={() => onLogout(session)}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('sessions.logoutA11y', { device: session.device })}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: pressed ? colors.dangerSoft : isDark ? 'rgba(248,113,113,0.10)' : 'rgba(220,38,38,0.06)' },
          ]}
        >
          <Text variant="label" color={colors.danger} numberOfLines={1}>
            {t('sessions.logout')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingHorizontal: ROW_PADDING,
    paddingVertical: space.md,
  },
  icon: { width: SESSION_ICON, height: SESSION_ICON, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2, minWidth: 0 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingHorizontal: space.sm + 2,
    borderRadius: radius.pill,
    maxWidth: '40%',
  },
  pillText: { flexShrink: 1, fontSize: 12 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  action: {
    minHeight: 32,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
