import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { SESSION_TEXT_INSET, SessionRow, SettingsGroup, SettingsRow } from '@/components/settings';
import { useRevokeOtherSessions, useRevokeSession, useSessions, toSession } from '@/api';
import { Dialog, EmptyState, SkeletonCard, Text, toast } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import type { Session } from '@/types';
import { gradients, palette, radius, SCREEN_PADDING, space, useTheme } from '@/theme';
import { formatNumber } from '@/utils/format';
import { haptic } from '@/utils/haptics';

type Target = { kind: 'one'; session: Session } | { kind: 'all' } | null;

export default function SessionsScreen() {
  const { t, lang } = useI18n('settings');
  const { colors } = useTheme();
  // ME-03 list, ME-04 revoke one (optimistic), ME-05 revoke all others.
  const sessionsQuery = useSessions();
  const { data: sessions, isLoading } = sessionsQuery;
  const revokeOne = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const [target, setTarget] = useState<Target>(null);

  const { current, others } = useMemo(() => {
    const list = (sessions ?? []).map(toSession);
    return { current: list.filter((s) => s.current), others: list.filter((s) => !s.current) };
  }, [sessions]);

  const confirm = () => {
    if (!target) return;
    if (target.kind === 'one') {
      revokeOne.mutate(target.session.id, {
        onSuccess: () => {
          haptic.success();
          toast.success(t('sessions.logoutDone'));
        },
      });
    } else {
      revokeOthers.mutate(undefined, {
        onSuccess: () => {
          haptic.success();
          toast.success(t('sessions.logoutAllDone'));
        },
      });
    }
    setTarget(null);
  };

  return (
    <Screen padded={false}>
      <Header title={t('sessions.title')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(320)} style={styles.info}>
          <LinearGradient colors={gradients.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View pointerEvents="none" style={styles.infoGlow} />
          <View style={styles.shield}>
            <Icon name="shield" size={22} color={palette.goldLight} strokeWidth={2} />
          </View>
          <View style={styles.flex}>
            <Text variant="h3" color={palette.white}>
              {t('sessions.infoTitle')}
            </Text>
            <Text variant="body" color="rgba(255,255,255,0.78)" style={styles.infoBody}>
              {t('sessions.infoBody')}
            </Text>
          </View>
        </Animated.View>

        {current.length > 0 ? (
          <SettingsGroup title={t('sessions.current')} index={1} dividerInset={SESSION_TEXT_INSET}>
            {current.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </SettingsGroup>
        ) : null}

        {isLoading ? (
          <View style={styles.loading}>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </View>
        ) : sessionsQuery.isError && !sessions ? (
          <EmptyState
            icon="wifi-off"
            title={t('common:states.error')}
            message={sessionsQuery.error.isNetwork ? t('common:states.offline') : sessionsQuery.error.message}
            actionLabel={t('common:actions.retry')}
            onAction={() => void sessionsQuery.refetch()}
          />
        ) : others.length > 0 ? (
          <>
            <SettingsGroup
              title={`${t('sessions.others')} · ${formatNumber(others.length, lang)}`}
              index={2}
              dividerInset={SESSION_TEXT_INSET}
            >
              {others.map((s) => (
                <Animated.View key={s.id} exiting={FadeOut.duration(200)} layout={LinearTransition.duration(250)}>
                  <SessionRow session={s} onLogout={(session) => setTarget({ kind: 'one', session })} />
                </Animated.View>
              ))}
            </SettingsGroup>
            <SettingsGroup index={3} footer={t('sessions.logoutAllFooter')}>
              <SettingsRow
                icon="logout"
                title={t('sessions.logoutAll')}
                destructive
                showChevron={false}
                onPress={() => setTarget({ kind: 'all' })}
              />
            </SettingsGroup>
          </>
        ) : (
          <Animated.View
            entering={FadeInDown.duration(320).delay(120)}
            style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={[styles.emptyIcon, { backgroundColor: colors.successSoft }]}>
              <Icon name="check-circle" size={26} color={colors.success} strokeWidth={2} />
            </View>
            <Text variant="bodyBold" align="center">
              {t('sessions.empty')}
            </Text>
            <Text variant="caption" color="muted" align="center">
              {t('sessions.emptyMessage')}
            </Text>
          </Animated.View>
        )}
      </ScrollView>

      <Dialog
        visible={target !== null}
        onClose={() => setTarget(null)}
        icon="devices"
        tone="danger"
        title={target?.kind === 'all' ? t('sessions.logoutAllTitle') : t('sessions.logoutTitle')}
        message={
          target?.kind === 'one'
            ? t('sessions.logoutMessage', { device: target.session.device })
            : t('sessions.logoutAllMessage')
        }
        primaryLabel={t('sessions.logout')}
        onPrimary={confirm}
        secondaryLabel={t('common:actions.cancel')}
        onSecondary={() => setTarget(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.lg, paddingBottom: space.huge },
  flex: { flex: 1 },
  loading: { gap: space.md, marginTop: space.xl },
  info: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    padding: space.lg + 2,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: space.xxl + space.xs,
  },
  infoGlow: {
    position: 'absolute',
    top: -60,
    end: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(201,162,74,0.14)',
  },
  shield: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(201,162,74,0.2)',
  },
  infoBody: { marginTop: space.xs },
  empty: {
    alignItems: 'center',
    gap: space.sm,
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
});
