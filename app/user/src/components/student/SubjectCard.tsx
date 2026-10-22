import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon, SubjectIcon } from '@/components/icons';
import { PressableScale, ProgressBar, Text } from '@/components/ui';
import { BLURHASH } from '@/constants/images';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { gradients, palette, radius, shadows, space, subjectColors, useTheme } from '@/theme';
import type { Subject } from '@/types';

export interface SubjectCardProps {
  subject: Subject;
  index?: number;
  variant?: 'large' | 'compact';
  onPress?: () => void;
}

const enterDelay = (i: number) => Math.min(i * 60, 300);

/** Subject card — `large` magazine image card for the Subjects tab, `compact` horizontal card for carousels. */
export const SubjectCard = memo(function SubjectCard({ subject, index = 0, variant = 'large', onPress }: SubjectCardProps) {
  const { colors, isDark } = useTheme();
  const { t, L } = useI18n(['subjects', 'common']);
  const entitled = useAuthStore((s) => s.hasSubject(subject.id));
  // Server lock flag wins (null = unknown → fall back to the cached entitlements).
  const unlocked = subject.locked === false || (subject.locked == null && entitled);
  const progress = Math.round(subject.progressPct ?? 0);
  const color = subjectColors[subject.id] ?? subject.color;
  const locked = !unlocked;

  const handlePress = useCallback(() => {
    if (onPress) return onPress();
    router.push({ pathname: '/subject/[id]', params: { id: subject.id } });
  }, [onPress, subject.id]);

  const name = L(subject.name);
  const a11y = locked ? t('subjects:card.a11yLocked', { name }) : t('subjects:card.a11y', { name, progress });

  if (variant === 'compact') {
    return (
      <Animated.View entering={FadeInDown.duration(350).delay(enterDelay(index))}>
        <PressableScale
          onPress={handlePress}
          accessibilityLabel={a11y}
          style={[styles.compact, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.compactThumb, { backgroundColor: colors.surfaceMuted }]}>
            <Image
              source={{ uri: subject.image }}
              placeholder={{ blurhash: BLURHASH }}
              transition={300}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: `${color}B3` }]} pointerEvents="none">
              {locked ? <Icon name="lock" size={20} color="#FFFFFF" /> : <SubjectIcon subjectId={subject.id} size={24} color="#FFFFFF" />}
            </View>
          </View>
          <View style={styles.compactBody}>
            <Text variant="bodyBold" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" color="muted" numberOfLines={1}>
              {`${t('common:units.lessons', { count: subject.lessonsCount })} · ${
                locked ? t('common:premium.locked') : t('common:units.percent', { value: progress })
              }`}
            </Text>
            <ProgressBar
              progress={locked ? 0 : progress}
              height={4}
              color={color}
              trackColor={isDark ? 'rgba(255,255,255,0.08)' : colors.surfaceMuted}
            />
          </View>
        </PressableScale>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(enterDelay(index))}>
      <PressableScale
        onPress={handlePress}
        accessibilityLabel={a11y}
        style={[styles.card, shadows.md, { backgroundColor: palette.navy }]}
      >
        <Image
          source={{ uri: subject.image }}
          placeholder={{ blurhash: BLURHASH }}
          transition={300}
          contentFit="cover"
          cachePolicy="memory-disk"
          style={[StyleSheet.absoluteFill, locked && styles.dim]}
        />
        <LinearGradient
          colors={gradients.imageOverlay}
          locations={[0.15, 0.55, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(7,20,38,0.45)', 'rgba(7,20,38,0)']}
          style={styles.topScrim}
          pointerEvents="none"
        />

        {/* Top: icon chip + status pill */}
        <View style={styles.top} pointerEvents="none">
          <View style={[styles.chip, { backgroundColor: color }]}>
            <SubjectIcon subjectId={subject.id} size={20} color="#FFFFFF" />
          </View>
          {locked ? (
            <View style={[styles.pill, styles.lockPill]}>
              <Icon name="lock" size={12} color={palette.goldLight} />
              <Text variant="label" color="#FFFFFF" numberOfLines={1}>
                {t('common:premium.locked')}
              </Text>
            </View>
          ) : progress >= 100 ? (
            <View style={[styles.pill, styles.donePill]}>
              <Icon name="check" size={12} color={palette.navy} strokeWidth={2.4} />
              <Text variant="label" color={palette.navy} tabular>
                {t('common:units.percent', { value: progress })}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Bottom: name, meta, progress */}
        <View style={styles.bottom} pointerEvents="none">
          <Text
            variant="h1"
            display
            color="#FFFFFF"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {name}
          </Text>
          <Text variant="caption" color="rgba(255,255,255,0.82)" numberOfLines={1}>
            {L(subject.tagline)}
          </Text>

          <View style={styles.metaRow}>
            <View style={styles.meta}>
              <Icon name="lesson" size={14} color={palette.goldLight} />
              <Text variant="label" color="#FFFFFF" numberOfLines={1}>
                {t('common:units.lessons', { count: subject.lessonsCount })}
              </Text>
            </View>
            <View style={styles.metaDot} />
            <View style={styles.meta}>
              <Icon name="clock" size={14} color={palette.goldLight} />
              <Text variant="label" color="#FFFFFF" numberOfLines={1}>
                {t('common:units.hours', { count: subject.hours })}
              </Text>
            </View>
            <View style={styles.flex} />
            <View style={styles.go}>
              <Icon name={locked ? 'crown' : 'chevron'} size={16} color={palette.navy} />
            </View>
          </View>

          {locked ? null : (
            <View style={styles.progressRow}>
              <View style={styles.flex}>
                <ProgressBar progress={progress} height={4} color={palette.gold} trackColor="rgba(255,255,255,0.22)" />
              </View>
              <Text variant="caption" color="rgba(255,255,255,0.9)" tabular align="end" style={styles.pct}>
                {t('common:units.percent', { value: progress })}
              </Text>
            </View>
          )}
        </View>
      </PressableScale>
    </Animated.View>
  );
});

const GO = 30;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  card: {
    width: '100%',
    aspectRatio: 16 / 10,
    minHeight: 200,
    borderRadius: radius.lg,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  dim: { opacity: 0.55 },
  topScrim: { position: 'absolute', top: 0, start: 0, end: 0, height: 80 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.lg,
  },
  chip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  lockPill: {
    backgroundColor: 'rgba(7,20,38,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(230,199,122,0.75)',
  },
  donePill: { backgroundColor: palette.goldLight },
  bottom: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, minHeight: GO },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.6)' },
  go: {
    width: GO,
    height: GO,
    borderRadius: GO / 2,
    backgroundColor: palette.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  pct: { minWidth: 34 },
  compact: {
    width: 264,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  compactThumb: { width: 56, height: 56, borderRadius: radius.sm, overflow: 'hidden' },
  compactBody: { flex: 1, gap: 5 },
});
