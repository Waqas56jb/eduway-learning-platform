import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon, SubjectIcon } from '@/components/icons';
import { PressableScale, ProgressBar, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, shadows, space, subjectColors } from '@/theme';
import type { SubjectId } from '@/types';

/** Minimal subject shape needed by the tile (slug id). */
export interface QuickStartSubject {
  id: SubjectId;
}

interface Props {
  subject: QuickStartSubject;
  count: number;
  mastery: number;
  locked?: boolean;
  index?: number;
  /** Explicit width (grid column width computed by the parent). */
  width?: number;
  /** Full-row horizontal layout (used for the odd last tile of a grid). */
  wide?: boolean;
  onPress(subject: QuickStartSubject): void;
}

const WHITE = '#FFFFFF';
const WHITE_SOFT = 'rgba(255,255,255,0.85)';

/** Colored subject tile for one-tap practice. */
export const QuickStartCard = memo(function QuickStartCard({
  subject,
  count,
  mastery,
  locked,
  index = 0,
  width,
  wide = false,
  onPress,
}: Props) {
  const { t } = useI18n('practice');
  const color = subjectColors[subject.id];
  const name = t(`common:subjects.${subject.id}`);
  const questionsLabel = t('common:units.questions', { count });

  const badge = locked ? (
    <View style={styles.lock}>
      <Icon name="lock" size={14} color={WHITE} />
    </View>
  ) : (
    <View style={styles.go}>
      <Icon name="arrow" size={16} color={WHITE} />
    </View>
  );

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(Math.min(index * 60, 300))} style={width ? { width } : undefined}>
      <PressableScale
        onPress={() => onPress(subject)}
        accessibilityRole="button"
        accessibilityLabel={t('quickStart.a11y', { subject: name, questions: questionsLabel, value: mastery })}
        style={[wide ? styles.wide : styles.card, shadows.md]}
      >
        <LinearGradient
          colors={[color, shade(color)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.glow} pointerEvents="none" />

        {wide ? (
          <>
            <View style={styles.iconWrap}>
              <SubjectIcon subjectId={subject.id} size={22} color={WHITE} />
            </View>
            <View style={styles.wideText}>
              <Text variant="h3" color={WHITE} numberOfLines={1}>
                {name}
              </Text>
              <Text variant="caption" color={WHITE_SOFT} numberOfLines={1}>
                {locked ? t('quickStart.locked') : `${questionsLabel} · ${t('quickStart.mastery', { value: mastery })}`}
              </Text>
              <View style={styles.wideBar}>
                <ProgressBar progress={mastery} height={4} color={WHITE} trackColor="rgba(255,255,255,0.25)" />
              </View>
            </View>
            {badge}
          </>
        ) : (
          <>
            <View style={styles.top}>
              <View style={styles.iconWrap}>
                <SubjectIcon subjectId={subject.id} size={22} color={WHITE} />
              </View>
              {badge}
            </View>
            <View style={styles.bottom}>
              <Text variant="h3" color={WHITE} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {name}
              </Text>
              <Text variant="caption" color={WHITE_SOFT} numberOfLines={1}>
                {locked ? t('quickStart.locked') : questionsLabel}
              </Text>
              <View style={styles.mastery}>
                <ProgressBar progress={mastery} height={4} color={WHITE} trackColor="rgba(255,255,255,0.25)" />
                <Text variant="caption" color={WHITE} tabular numberOfLines={1}>
                  {t('quickStart.mastery', { value: mastery })}
                </Text>
              </View>
            </View>
          </>
        )}
      </PressableScale>
    </Animated.View>
  );
});

/** Darken a hex color ~30% for the gradient tail. */
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * 0.68));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const styles = StyleSheet.create({
  card: {
    minHeight: 172,
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: space.lg,
    justifyContent: 'space-between',
    gap: space.lg,
  },
  wide: {
    minHeight: 84,
    borderRadius: radius.lg,
    overflow: 'hidden',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  glow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    top: -64,
    end: -56,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lock: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  go: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { gap: space.xxs },
  mastery: { gap: space.xs, marginTop: space.sm },
  wideText: { flex: 1, gap: space.xxs },
  wideBar: { marginTop: space.xs },
});
