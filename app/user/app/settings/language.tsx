import { useState } from 'react';
import { isRTL } from '@/utils/rtl';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { LanguageCard } from '@/components/settings';
import { Dialog, Text, toast } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { updateMe } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useLangStore } from '@/store/langStore';
import type { Lang } from '@/types';
import { radius, SCREEN_PADDING, space, useTheme } from '@/theme';

const LANGS: Lang[] = ['ar', 'en'];

/** Switch locally (instant) and sync `language` to the profile (ME-02) — fire-and-forget. */
function applyLanguage(next: Lang) {
  void useLangStore.getState().setLanguage(next);
  if (useAuthStore.getState().isAuthenticated) {
    void updateMe({ language: next })
      .then((u) => useAuthStore.getState().applyUser(u))
      .catch(() => {});
  }
}

export default function LanguageScreen() {
  const { t, lang } = useI18n('settings');
  const { colors } = useTheme();
  const [pending, setPending] = useState<Lang | null>(null);

  const select = (next: Lang) => {
    if (next === lang) return;
    // Switching is instant: the root view flips its layout direction, no restart needed.
    applyLanguage(next);
    toast.success(t('language.changed'));
  };

  const confirm = () => {
    if (!pending) return;
    const next = pending;
    setPending(null);
    applyLanguage(next);
  };

  return (
    <Screen padded={false}>
      <Header title={t('language.title')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(320)}>
          <Text variant="h2" display style={styles.title}>
            {t('language.heading')}
          </Text>
          <Text variant="body" color="muted" style={styles.subtitle}>
            {t('language.subtitle')}
          </Text>
        </Animated.View>

        <View accessibilityRole="radiogroup">
          {LANGS.map((l, i) => (
            <Animated.View key={l} entering={FadeInDown.duration(320).delay(60 + i * 60)}>
              <LanguageCard lang={l} selected={l === lang} onPress={() => select(l)} />
            </Animated.View>
          ))}
        </View>

        <Animated.View
          entering={FadeInDown.duration(320).delay(200)}
          style={[styles.note, { backgroundColor: colors.surfaceMuted }]}
        >
          <Icon name="info" size={16} color={colors.muted} />
          <Text variant="caption" color="muted" style={styles.flex}>
            {t('language.restartNote')}
          </Text>
        </Animated.View>
      </ScrollView>

      <Dialog
        visible={pending !== null}
        onClose={() => setPending(null)}
        icon="language"
        title={t('language.restartTitle')}
        message={t('language.restartMessage')}
        primaryLabel={t('language.restartConfirm')}
        onPrimary={confirm}
        secondaryLabel={t('common:actions.cancel')}
        onSecondary={() => setPending(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.md, paddingBottom: space.huge },
  title: { marginBottom: space.xs },
  subtitle: { marginBottom: space.xl },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    marginTop: space.sm,
  },
  flex: { flex: 1 },
});
