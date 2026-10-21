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
import { useAuthStore, useProgressStore } from '@/store';
import { gradients, radius, shadows, space, subjectColors, useTheme } from '@/theme';
import type { Subject } from '@/types';

export interface SubjectCardProps {
  subject: Subject;
  index?: number;
  variant?: 'large' | 'compact';
  onPress?: () => void;
}

const COVER_H = 156;
const STRIPE_W = 4;

/** Subject card — `large` image card for the Subjects tab, `compact` horizontal card for carousels. */
export const SubjectCard = memo(function SubjectCard({ subject, index = 0, variant = 'large', onPress }: SubjectCardProps) {
  const { colors, isDark } = useTheme();
  const { t, L } = useI18n(['subjects', 'common']);
  const unlocked = useAuthStore((s) => s.hasSubject(subject.id));
  const progress = useProgressStore((s) => s.subjectCompletion(subject.id));
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
      <Animated.View entering={FadeInDown.duration(260).delay(index * 60)}>
        <PressableScale
          onPress={handlePress}
          accessibilityLabel={a11y}
          style={[
            styles.compact,
            shadows.sm,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: locked ? 0.72 : 1 },
          ]}
        >
          <View style={[styles.compactStripe, { backgroundColor: color }]} />
          <View style={styles.compactThumb}>
            <Image
              source={{ uri: subject.image }}
              placeholder={{ blurhash: BLURHASH }}
              transition={300}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: `${color}B3` }]} />
            <View style={styles.compactIcon}>
              {locked ? <Icon name="lock" size={20} color="#FFFFFF" /> : <SubjectIcon subjectId={subject.id} size={24} color="#FFFFFF" />}
            </View>
          </View>
          <View style={styles.compactBody}>
            <Text variant="bodyBold" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" color="muted" numberOfLines={1}>
              {t('common:units.lessons', { count: subject.lessonsCount })}
              {'  ·  '}
              {locked ? t('common:premium.locked') : t('common:units.percent', { value: progress })}
            </Text>
            <ProgressBar progress={locked ? 0 : progress} height={5} color={color} />
          </View>
        </PressableScale>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(320).delay(index * 70)}>
      <PressableScale
        onPress={handlePress}
        accessibilityLabel={a11y}
        style={[styles.card, shadows.md, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.cover}>
          <Image
            source={{ uri: subject.image }}
            placeholder={{ blurhash: BLURHASH }}
            transition={300}
            contentFit="cover"
            cachePolicy="memory-disk"
            style={[StyleSheet.absoluteFill, locked && styles.dim]}
          />
          <LinearGradient colors={gradients.imageOverlay} style={StyleSheet.absoluteFill} />
          {locked ? <View style={[StyleSheet.absoluteFill, styles.lockShade]} /> : null}

          <View style={styles.coverTop}>
            <View style={[styles.iconCircle, { backgroundColor: color }]}>
              <SubjectIcon subjectId={subject.id} size={22} color="#FFFFFF" />
            </View>
            {locked ? (
              <View style={styles.lockBadge}>
                <Icon name="lock" size={13} color="#FFFFFF" />
                <Text variant="caption" color="#FFFFFF" style={styles.lockText}>
                  {t('common:premium.locked')}
                </Text>
              </View>
            ) : (
              <View style={styles.percentBadge}>
                <Text variant="label" color="#FFFFFF" tabular>
                  {t('common:units.percent', { value: progress })}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.coverBottom}>
            <Text variant="h2" display color="#FFFFFF" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" color="rgba(255,255,255,0.85)" numberOfLines={1}>
              {L(subject.tagline)}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.metaRow}>
            <Meta icon="lesson" label={t('common:units.lessons', { count: subject.lessonsCount })} color={colors.muted} />
            <Meta icon="clock" label={t('common:units.hours', { count: subject.hours })} color={colors.muted} />
            <Meta icon="question-bank" label={t('common:units.questions', { count: subject.questionsCount })} color={colors.muted} />
          </View>

          <View style={styles.progressRow}>
            <View style={styles.progressBar}>
              <ProgressBar
                progress={locked ? 0 : progress}
                height={6}
                color={color}
                trackColor={isDark ? 'rgba(255,255,255,0.08)' : colors.surfaceMuted}
              />
            </View>
            <Text variant="label" color={locked ? 'muted' : color} tabular>
              {t('common:units.percent', { value: locked ? 0 : progress })}
            </Text>
          </View>

          <View style={[styles.teacherRow, { borderTopColor: colors.border }]}>
            <View style={[styles.teacherDot, { backgroundColor: `${color}22` }]}>
              <Icon name="user" size={14} color={color} />
            </View>
            <Text variant="caption" color="muted" numberOfLines={1} style={styles.flex}>
              {L(subject.teacher)}
            </Text>
            <Icon name="chevron" size={18} color={colors.muted} />
          </View>
        </View>

        <View style={[styles.stripe, { backgroundColor: color }]} />
      </PressableScale>
    </Animated.View>
  );
});

function Meta({ icon, label, color }: { icon: 'lesson' | 'clock' | 'question-bank'; label: string; color: string }) {
  return (
    <View style={styles.meta}>
      <Icon name={icon} size={14} color={color} />
      <Text variant="caption" color="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  stripe: { position: 'absolute', top: 0, bottom: 0, start: 0, width: STRIPE_W },
  cover: { height: COVER_H, justifyContent: 'space-between' },
  dim: { opacity: 0.6 },
  lockShade: { backgroundColor: 'rgba(7,20,38,0.4)' },
  coverTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.md,
    paddingStart: space.lg + STRIPE_W,
    paddingEnd: space.md,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(7,20,38,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201,162,74,0.7)',
  },
  lockText: { fontSize: 11 },
  percentBadge: {
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(7,20,38,0.55)',
  },
  coverBottom: { paddingStart: space.lg + STRIPE_W, paddingEnd: space.lg, paddingBottom: space.md, gap: 2 },
  body: { paddingStart: space.lg + STRIPE_W, paddingEnd: space.lg, paddingTop: space.md, paddingBottom: space.sm, gap: space.md },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  progressBar: { flex: 1 },
  teacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
  },
  teacherDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  compact: {
    width: 264,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    paddingStart: space.sm + STRIPE_W,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  compactStripe: { position: 'absolute', top: 0, bottom: 0, start: 0, width: STRIPE_W },
  compactThumb: { width: 56, height: 56, borderRadius: radius.sm, overflow: 'hidden' },
  compactIcon: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  compactBody: { flex: 1, gap: 5 },
});
