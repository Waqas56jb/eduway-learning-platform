import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import {
  APP_VERSION,
  AppVersion,
  LogoutDialog,
  ROW_GAP,
  ROW_TILE,
  SettingsBlock,
  SettingsGroup,
  SettingsRow,
  SupportSheet,
  sendTestNotification,
} from '@/components/settings';
import { SegmentedControl, Switch, Text, toast } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useNotificationPrefs, useSessions, useUpdateNotificationPrefs, type NotificationPrefs } from '@/api';
import { usePrefsStore, type ThemeMode } from '@/store/prefsStore';
import { palette, SCREEN_PADDING, space, subjectColors, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';

type PrefKey = keyof Pick<NotificationPrefs, 'lessons' | 'exams' | 'payments' | 'progress'>;

const NOTIF_ROWS: { key: PrefKey; icon: IconName; color: string }[] = [
  { key: 'lessons', icon: 'lesson', color: subjectColors.math },
  { key: 'exams', icon: 'exam', color: subjectColors.physics },
  { key: 'payments', icon: 'wallet', color: subjectColors.chemistry },
  { key: 'progress', icon: 'chart', color: '#EA580C' },
];

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

export default function SettingsScreen() {
  const { t, lang } = useI18n('settings');
  const { isDark } = useTheme();
  const themeMode = usePrefsStore((s) => s.themeMode);
  const setThemeMode = usePrefsStore((s) => s.setThemeMode);
  // ME-09 / ME-10 (optimistic) — notification preferences live on the server.
  const { data: notificationPrefs } = useNotificationPrefs();
  const updatePrefs = useUpdateNotificationPrefs();
  const setNotificationPref = useCallback(
    (key: PrefKey, value: boolean) => updatePrefs.mutate({ [key]: value }),
    [updatePrefs],
  );
  const sessionCount = useSessions().data?.length ?? 0;
  const [supportOpen, setSupportOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const onTest = useCallback(async () => {
    setSending(true);
    const result = await sendTestNotification(t('settings.test.title'), t('settings.test.body'));
    setSending(false);
    if (result === 'scheduled') {
      haptic.success();
      toast.show({ message: t('settings.test.scheduled'), tone: 'success', icon: 'bell' });
    } else if (result === 'denied') {
      haptic.warning();
      toast.show({ message: t('settings.test.denied'), tone: 'info', icon: 'alert' });
    } else {
      haptic.error();
      toast.error(t('settings.test.failed'));
    }
  }, [t]);

  return (
    <Screen padded={false}>
      <Header title={t('settings.title')} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SettingsGroup title={t('settings.sections.preferences')} index={0}>
          <SettingsRow
            icon="language"
            iconColor={palette.gold}
            title={t('settings.language')}
            value={lang === 'ar' ? 'العربية' : 'English'}
            onPress={() => router.push('/settings/language')}
          />
          <SettingsBlock>
            <View style={styles.themeHead}>
              <View style={[styles.tile, { backgroundColor: isDark ? palette.navyLight : palette.navy }]}>
                <Icon name={isDark ? 'moon' : 'sun'} size={17} color={palette.goldLight} strokeWidth={2} />
              </View>
              <Text variant="bodyMedium" style={styles.flex} numberOfLines={1}>
                {t('settings.theme')}
              </Text>
            </View>
            <SegmentedControl
              options={THEME_MODES.map((m) => ({ key: m, label: t(`settings.themeOptions.${m}`) }))}
              value={themeMode}
              onChange={(key) => setThemeMode(key as ThemeMode)}
              height={40}
            />
          </SettingsBlock>
        </SettingsGroup>

        <SettingsGroup title={t('settings.sections.notifications')} footer={t('settings.notifFooter')} index={1}>
          {NOTIF_ROWS.map(({ key, icon, color }) => (
            <SettingsRow
              key={key}
              icon={icon}
              iconColor={color}
              title={t(`settings.notif.${key}`)}
              subtitle={t(`settings.notif.${key}Sub`)}
              showChevron={false}
              right={
                <Switch
                  value={notificationPrefs?.[key] ?? false}
                  onValueChange={(v: boolean) => setNotificationPref(key, v)}
                  accessibilityLabel={t(`settings.notif.${key}`)}
                />
              }
            />
          ))}
          <SettingsRow
            icon="bell"
            iconColor="#F59E0B"
            title={t('settings.test.button')}
            loading={sending}
            showChevron={false}
            onPress={() => void onTest()}
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.sections.account')} index={2}>
          <SettingsRow icon="user" title={t('settings.editProfile')} onPress={() => router.push('/settings/edit-profile')} />
          <SettingsRow
            icon="devices"
            iconColor="#0EA5E9"
            title={t('settings.sessions')}
            subtitle={t('settings.sessionsSub', { count: sessionCount })}
            onPress={() => router.push('/settings/sessions')}
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.sections.about')} index={3}>
          <SettingsRow icon="note" iconColor="#0EA5E9" title={t('settings.terms')} onPress={() => router.push('/legal/terms')} />
          <SettingsRow icon="shield" iconColor="#4F46E5" title={t('settings.privacy')} onPress={() => router.push('/legal/privacy')} />
          <SettingsRow icon="headset" iconColor="#16A34A" title={t('settings.support')} onPress={() => setSupportOpen(true)} />
          <SettingsRow icon="info" iconColor="#64748B" title={t('settings.appVersion')} value={APP_VERSION} />
        </SettingsGroup>

        <SettingsGroup index={4}>
          <SettingsRow icon="logout" title={t('logout.row')} destructive showChevron={false} onPress={() => setLogoutOpen(true)} />
        </SettingsGroup>

        <AppVersion />
      </ScrollView>

      <SupportSheet visible={supportOpen} onClose={() => setSupportOpen(false)} />
      <LogoutDialog visible={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.lg, paddingBottom: space.huge },
  themeHead: { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, marginBottom: space.md },
  tile: { width: ROW_TILE, height: ROW_TILE, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
