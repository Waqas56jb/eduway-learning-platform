import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/layout';
import {
  AppVersion,
  LogoutDialog,
  ProfileHeader,
  ProfileStats,
  SettingsGroup,
  SettingsRow,
  SupportSheet,
  type ProfileStat,
} from '@/components/settings';
import { Badge } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useMeQuery, useMistakeSummary, useProgressSummary, useUnreadCount } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { palette, SCREEN_PADDING, space, subjectColors } from '@/theme';
import { formatNumber } from '@/utils/format';

const HERO_OVERLAP = 52;

/** Solid icon-tile colors for the grouped menus (white glyphs). */
const TILE = {
  mistakes: '#E5484D',
  exams: subjectColors.physics,
  bank: subjectColors.math,
  progress: subjectColors.chemistry,
  subscription: palette.gold,
  notifications: '#F59E0B',
  settings: '#64748B',
  support: '#16A34A',
  terms: '#0EA5E9',
  privacy: '#4F46E5',
} as const;

export default function ProfileScreen() {
  const { t, lang } = useI18n('settings');
  const user = useAuthStore((s) => s.user);
  const allowance = useAuthStore((s) => s.me?.aiAllowance);
  useMeQuery();
  const { data: summary } = useProgressSummary();
  const { data: mistakes } = useMistakeSummary();
  const unread = useUnreadCount().data ?? 0;
  const unresolved = mistakes?.unresolved ?? 0;
  const completed = summary?.completedLessons ?? 0;
  const quizAvg = summary?.quizAverage ?? null;
  const streak = summary?.streak ?? user?.streak ?? 0;
  const aiLeft = allowance ? allowance.remaining : Math.max(0, (user?.aiQuota ?? 0) - (user?.aiUsed ?? 0));
  const [supportOpen, setSupportOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const stats = useMemo<ProfileStat[]>(() => {
    if (!user) return [];
    const toProgress = () => router.push('/progress');
    return [
      { key: 'lessons', icon: 'lesson', value: formatNumber(completed, lang), label: t('profile.stats.lessons'), color: subjectColors.math, onPress: toProgress },
      { key: 'quiz', icon: 'target', value: quizAvg === null ? '—' : `${Math.round(quizAvg)}%`, label: t('profile.stats.quizAvg'), color: palette.success, onPress: toProgress },
      { key: 'streak', icon: 'flame', value: formatNumber(streak, lang), label: t('profile.stats.streak'), color: '#EA580C', onPress: toProgress },
      {
        key: 'ai',
        icon: 'sparkles',
        value: formatNumber(aiLeft, lang),
        label: t('profile.stats.aiLeft'),
        color: palette.gold,
        onPress: () => router.push('/(tabs)/tutor'),
      },
    ];
  }, [user, completed, quizAvg, streak, aiLeft, lang, t]);

  if (!user) return <Screen />;

  return (
    <Screen scroll padded={false} edges={[]} tabBarSpace statusBar="light">
      <ProfileHeader user={user} overlap={HERO_OVERLAP} />

      <View style={styles.statsWrap}>
        <ProfileStats stats={stats} />
      </View>

      <View style={styles.body}>
        <SettingsGroup title={t('profile.groups.learning')} index={0}>
          <SettingsRow
            icon="mistakes"
            iconColor={TILE.mistakes}
            title={t('profile.menu.mistakes')}
            subtitle={t('profile.menu.mistakesSub')}
            accessibilityLabel={unresolved > 0 ? `${t('profile.menu.mistakes')}, ${formatNumber(unresolved, lang)}` : undefined}
            badge={unresolved > 0 ? <Badge label={formatNumber(unresolved, lang)} tone="danger" size="sm" /> : undefined}
            onPress={() => router.push('/mistakes')}
          />
          <SettingsRow
            icon="exam"
            iconColor={TILE.exams}
            title={t('profile.menu.exams')}
            subtitle={t('profile.menu.examsSub')}
            onPress={() => router.push('/exams')}
          />
          <SettingsRow
            icon="question-bank"
            iconColor={TILE.bank}
            title={t('profile.menu.questionBank')}
            subtitle={t('profile.menu.questionBankSub')}
            onPress={() => router.push('/question-bank')}
          />
          <SettingsRow
            icon="chart"
            iconColor={TILE.progress}
            title={t('profile.menu.progress')}
            subtitle={t('profile.menu.progressSub')}
            onPress={() => router.push('/progress')}
          />
        </SettingsGroup>

        <SettingsGroup title={t('profile.groups.account')} index={1}>
          <SettingsRow
            icon="crown"
            iconColor={TILE.subscription}
            title={t('profile.menu.subscription')}
            subtitle={t('profile.menu.subscriptionSub', { count: user.daysRemaining })}
            onPress={() => router.push('/subscription')}
          />
          <SettingsRow
            icon="bell"
            iconColor={TILE.notifications}
            title={t('profile.menu.notifications')}
            subtitle={t('profile.menu.notificationsSub')}
            accessibilityLabel={unread > 0 ? `${t('profile.menu.notifications')}, ${t('profile.unread', { count: unread })}` : undefined}
            badge={unread > 0 ? <Badge label={formatNumber(unread, lang)} tone="gold" size="sm" /> : undefined}
            onPress={() => router.push('/notifications')}
          />
          <SettingsRow
            icon="user"
            title={t('profile.menu.editProfile')}
            subtitle={t('profile.menu.editProfileSub')}
            onPress={() => router.push('/settings/edit-profile')}
          />
          <SettingsRow
            icon="settings"
            iconColor={TILE.settings}
            title={t('profile.menu.settings')}
            subtitle={t('profile.menu.settingsSub')}
            onPress={() => router.push('/settings')}
          />
        </SettingsGroup>

        <SettingsGroup title={t('profile.groups.support')} index={2}>
          <SettingsRow
            icon="headset"
            iconColor={TILE.support}
            title={t('profile.menu.support')}
            subtitle={t('profile.menu.supportSub')}
            onPress={() => setSupportOpen(true)}
          />
          <SettingsRow icon="note" iconColor={TILE.terms} title={t('profile.menu.terms')} onPress={() => router.push('/legal/terms')} />
          <SettingsRow icon="shield" iconColor={TILE.privacy} title={t('profile.menu.privacy')} onPress={() => router.push('/legal/privacy')} />
        </SettingsGroup>

        <SettingsGroup index={3}>
          <SettingsRow icon="logout" title={t('logout.row')} destructive showChevron={false} onPress={() => setLogoutOpen(true)} />
        </SettingsGroup>

        <AppVersion />
      </View>

      <SupportSheet visible={supportOpen} onClose={() => setSupportOpen(false)} />
      <LogoutDialog visible={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsWrap: { marginTop: -HERO_OVERLAP, paddingHorizontal: SCREEN_PADDING, marginBottom: space.xxxl },
  body: { paddingHorizontal: SCREEN_PADDING },
});
