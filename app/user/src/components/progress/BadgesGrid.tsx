import { memo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/icons';
import { Badge, BottomSheet, PressableScale, ProgressBar, Text } from '@/components/ui';
import type { Achievement } from '@/data/progress';
import { useI18n } from '@/hooks/useI18n';
import { gradients, palette, radius, shadows, space, useTheme } from '@/theme';
import { formatDate } from '@/utils/format';

interface BadgesGridProps {
  items: Achievement[];
}

const COLUMNS = 3;
const GAP = space.md;

const pct = (a: Achievement) => Math.round(Math.min(100, (a.current / Math.max(1, a.target)) * 100));

/** Medallion: gold gradient when earned, muted disc + lock when locked. */
const Medallion = memo(function Medallion({ item, size }: { item: Achievement; size: number }) {
  const { colors } = useTheme();
  const iconSize = Math.round(size * 0.44);
  if (item.earned) {
    return (
      <View style={[{ borderRadius: size / 2 }, shadows.gold]}>
        <LinearGradient
          colors={gradients.gold}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[styles.medal, { width: size, height: size, borderRadius: size / 2 }]}
        >
          <View style={[styles.medalInner, { width: size - 10, height: size - 10, borderRadius: (size - 10) / 2 }]}>
            <Icon name={item.icon} size={iconSize} color={palette.navy} strokeWidth={2} />
          </View>
        </LinearGradient>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.medal,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceMuted, borderColor: colors.border },
        styles.lockedBorder,
      ]}
    >
      <Icon name={item.icon} size={iconSize} color={colors.muted} />
      <View style={[styles.lock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="lock" size={11} color={colors.muted} />
      </View>
    </View>
  );
});

/** 3-column achievements grid; tapping a badge opens a details sheet. */
export const BadgesGrid = memo(function BadgesGrid({ items }: BadgesGridProps) {
  const { colors } = useTheme();
  const { t, L, lang } = useI18n('progress');
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<Achievement | null>(null);
  const [visible, setVisible] = useState(false);

  const itemWidth = width ? Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS) : 0;
  const medalSize = itemWidth ? Math.min(64, Math.max(48, itemWidth - 40)) : 56;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const open = (a: Achievement) => {
    setActive(a);
    setVisible(true);
  };

  return (
    <>
      <View style={styles.grid} onLayout={onLayout}>
        {itemWidth > 0 &&
          items.map((a, i) => {
            const title = L(a.title);
            const p = pct(a);
            return (
              <Animated.View key={a.id} entering={FadeInDown.duration(320).delay(i * 45)} style={{ width: itemWidth }}>
                <PressableScale
                  onPress={() => open(a)}
                  accessibilityRole="button"
                  accessibilityLabel={a.earned ? t('badges.a11yEarned', { title }) : t('badges.a11yLocked', { title, value: p })}
                  style={[
                    styles.tile,
                    {
                      backgroundColor: a.earned ? colors.accentSoft : colors.surface,
                      borderColor: a.earned ? 'rgba(201,162,74,0.35)' : colors.border,
                    },
                  ]}
                >
                  <Medallion item={a} size={medalSize} />
                  <Text
                    variant="label"
                    align="center"
                    numberOfLines={2}
                    color={a.earned ? 'ink' : 'muted'}
                    style={styles.tileTitle}
                  >
                    {title}
                  </Text>
                  {a.earned ? (
                    <Text variant="caption" color="accent" align="center" numberOfLines={1}>
                      {t('badges.earned')}
                    </Text>
                  ) : (
                    <View style={styles.tileProgress}>
                      <ProgressBar progress={p} height={4} gradient />
                      <Text variant="caption" color="muted" align="center" tabular style={styles.tileCount}>
                        {t('badges.progress', { current: a.current, target: a.target })}
                      </Text>
                    </View>
                  )}
                </PressableScale>
              </Animated.View>
            );
          })}
      </View>

      <BottomSheet visible={visible} onClose={() => setVisible(false)} snap="auto">
        {active ? (
          <View style={styles.sheet}>
            <Animated.View key={active.id} entering={ZoomIn.springify().damping(14)}>
              <Medallion item={active} size={104} />
            </Animated.View>
            <Text variant="h2" display align="center" style={styles.sheetTitle}>
              {L(active.title)}
            </Text>
            <Badge
              label={active.earned ? t('badges.earned') : t('badges.locked')}
              tone={active.earned ? 'gold' : 'neutral'}
              icon={active.earned ? 'check-circle' : 'lock'}
              size="sm"
            />
            <Text variant="body" color="muted" align="center" style={styles.sheetBody}>
              {L(active.description)}
            </Text>

            {active.earned ? (
              active.earnedAt ? (
                <View style={[styles.infoBox, { backgroundColor: colors.accentSoft }]}>
                  <Icon name="calendar" size={18} color={colors.accent} />
                  <Text variant="bodyMedium">
                    {t('badges.earnedOn', {
                      date: formatDate(active.earnedAt, lang, { day: 'numeric', month: 'long', year: 'numeric' }),
                    })}
                  </Text>
                </View>
              ) : null
            ) : (
              <View style={[styles.lockedBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                <View style={styles.lockedHead}>
                  <Text variant="label" color="muted">
                    {t('badges.howTo')}
                  </Text>
                  <Text variant="label" tabular>
                    {t('badges.progress', { current: active.current, target: active.target })}
                  </Text>
                </View>
                <Text variant="bodyMedium">{L(active.hint)}</Text>
                <ProgressBar progress={pct(active)} height={8} gradient />
                <Text variant="caption" color="accent">
                  {t('badges.keepGoing', { value: pct(active) })}
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </BottomSheet>
    </>
  );
});

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, minHeight: 120 },
  tile: {
    alignItems: 'center',
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 158,
  },
  tileTitle: { marginTop: space.md, minHeight: 32 },
  tileProgress: { alignSelf: 'stretch', marginTop: space.xs, paddingHorizontal: space.xs },
  tileCount: { marginTop: 4 },
  medal: { alignItems: 'center', justifyContent: 'center' },
  medalInner: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  lockedBorder: { borderWidth: StyleSheet.hairlineWidth },
  lock: {
    position: 'absolute',
    bottom: -2,
    end: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  sheet: { alignItems: 'center', paddingTop: space.sm, paddingBottom: space.lg, gap: space.md },
  sheetTitle: { marginTop: space.sm },
  sheetBody: { paddingHorizontal: space.lg },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  lockedBox: {
    alignSelf: 'stretch',
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  lockedHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
