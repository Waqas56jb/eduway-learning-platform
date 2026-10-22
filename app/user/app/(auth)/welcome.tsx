import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Icon, Logo } from '@/components/icons';
import {
  CinematicCopy,
  CinematicScrim,
  copySteps,
  GlassButton,
  GoldButton,
  ink,
  KenBurnsImage,
  LangToggle,
  onboardingMedia,
  prefetchOnboardingMedia,
  Reveal,
  TextButton,
  useCinematicMetrics,
} from '@/components/onboarding';
import { Text } from '@/components/ui';
import { usePublicStats } from '@/api';
import { useI18n } from '@/hooks/useI18n';
import { usePrefsStore } from '@/store/prefsStore';
import { palette, space } from '@/theme';
import { formatNumber } from '@/utils/format';

const COPY_DELAY = 320;

/** Cinematic welcome: full-bleed graduation photo, brand mark, promise, and the two entry points. */
export default function WelcomeScreen() {
  const { t, isAr, lang } = useI18n('onboarding');
  // PUB-05 — live rating & student count; the bundled copy is the fallback while loading/offline.
  const { data: stats } = usePublicStats();
  const ratingLabel = stats && stats.rating > 0 ? stats.rating.toFixed(1) : t('welcome.rating');
  const studentsLabel = stats
    ? stats.displayOverrides.students ??
      (stats.students >= 100 ? `${formatNumber(Math.floor(stats.students / 100) * 100, lang)}+` : null)
    : null;
  const trustLabel = studentsLabel ? t('welcome.trustCount', { students: studentsLabel }) : t('welcome.trust');
  const { width, height, insets, gutter, compact, tiny, titleSize, bottomPad, contentWidth } = useCinematicMetrics();

  useEffect(() => {
    prefetchOnboardingMedia();
  }, []);

  const logoSize = tiny ? 52 : compact ? 60 : 72;
  const title = t('welcome.title');
  const after = copySteps(title, false); // stagger steps used by the copy block
  const go = (to: '/(auth)/register' | '/(auth)/login') => {
    usePrefsStore.getState().setOnboardingSeen(true);
    router.push(to);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KenBurnsImage image={onboardingMedia.welcome} active width={width} height={height} drift={1} priority="high" />
      <CinematicScrim topHeight={insets.top + 120} fadeStart={0.2} tint={0.16} />

      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.sm, paddingBottom: bottomPad, paddingHorizontal: gutter },
        ]}
      >
        {/* Top row: eyebrow + language */}
        <Reveal active delay={0} rise={-8} style={styles.topRow}>
          <Text
            variant="overline"
            color={ink.goldHi}
            style={[
              styles.eyebrow,
              isAr ? null : { letterSpacing: width < 360 ? 1.2 : 2.2, textTransform: 'uppercase' },
            ]}
          >
            {t('welcome.eyebrow')}
          </Text>
          <LangToggle />
        </Reveal>

        <View style={styles.spacer} />

        <View style={[styles.stack, { width: contentWidth }]}>
          <Reveal active delay={120} scaleFrom={0.72} duration={700} rise={0}>
            <Logo size={logoSize} variant="gold" withWordmark />
          </Reveal>

          <CinematicCopy
            title={title}
            subtitle={t('welcome.tagline')}
            active
            align="center"
            delay={COPY_DELAY}
            titleSize={Math.max(30, titleSize - 2)}
            style={{ marginTop: compact ? space.lg : space.xl }}
          />

          <Reveal active order={after} delay={COPY_DELAY} style={[styles.trust, { marginTop: compact ? space.lg : space.xl }]}>
            <View
              style={styles.stars}
              accessible
              accessibilityLabel={`${ratingLabel} — ${trustLabel}`}
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <Icon key={i} name="star" size={14} color={ink.gold} filled />
              ))}
              <Text variant="label" color={ink.white} style={styles.rating}>
                {ratingLabel}
              </Text>
            </View>
            <Text variant="caption" color={ink.faint} align="center" style={styles.trustText}>
              {trustLabel}
            </Text>
          </Reveal>

          <Reveal
            active
            order={after + 1}
            delay={COPY_DELAY}
            rise={28}
            style={[styles.actions, { marginTop: compact ? space.xl : space.xxl + 4 }]}
          >
            <GoldButton title={t('welcome.createAccount')} icon="arrow" onPress={() => go('/(auth)/register')} />
            <GlassButton title={t('welcome.login')} onPress={() => go('/(auth)/login')} />
          </Reveal>

          <Reveal active order={after + 2} delay={COPY_DELAY} rise={8} style={styles.legal}>
            <Text variant="caption" color={ink.faint} align="center">
              {t('welcome.legalPrefix')}
            </Text>
            <View style={styles.legalRow}>
              <TextButton
                title={t('welcome.terms')}
                variant="caption"
                color={ink.goldHi}
                accessibilityRole="link"
                onPress={() => router.push('/legal/terms')}
              />
              <Text variant="caption" color={ink.faint}>
                ·
              </Text>
              <TextButton
                title={t('welcome.privacy')}
                variant="caption"
                color={ink.goldHi}
                accessibilityRole="link"
                onPress={() => router.push('/legal/privacy')}
              />
            </View>
          </Reveal>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.navy900 },
  content: { flexGrow: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: 48,
  },
  eyebrow: { flexShrink: 1, fontSize: 11 },
  spacer: { flexGrow: 1, minHeight: space.xxxl },
  stack: { alignSelf: 'center', alignItems: 'center' },
  trust: { alignItems: 'center', gap: space.xs + 2 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rating: { marginStart: space.xs + 2 },
  trustText: { maxWidth: 300 },
  actions: { alignSelf: 'stretch', gap: space.md },
  legal: { alignItems: 'center', marginTop: space.lg },
  legalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
});
