import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { radius, SCREEN_PADDING, shadows, space, useTheme } from '@/theme';

export interface ProfileStat {
  key: string;
  icon: IconName;
  value: string;
  label: string;
  color: string;
  onPress?: () => void;
}

const CARD_PAD = space.sm;

/** Floating stats strip of equal columns (width computed from the window) overlapping the profile hero. */
export const ProfileStats = memo(function ProfileStats({ stats }: { stats: ProfileStat[] }) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const count = Math.max(stats.length, 1);
  const inner = width - SCREEN_PADDING * 2 - CARD_PAD * 2 - StyleSheet.hairlineWidth * 2;
  const cellW = Math.floor(inner / count);
  const compact = cellW < 76;

  return (
    <Animated.View
      entering={FadeInUp.duration(350).delay(120)}
      style={[
        styles.card,
        isDark ? shadows.sm : shadows.lg,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {stats.map((s, i) => {
        const content = (
          <>
            <View style={[styles.iconWrap, compact && styles.iconCompact, { backgroundColor: `${s.color}1F` }]}>
              <Icon name={s.icon} size={compact ? 15 : 17} color={s.color} strokeWidth={2} />
            </View>
            <Text
              variant="h3"
              tabular
              align="center"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={styles.value}
            >
              {s.value}
            </Text>
            <Text variant="caption" color="muted" align="center" numberOfLines={2} style={compact && styles.labelCompact}>
              {s.label}
            </Text>
          </>
        );
        return (
          <View key={s.key} style={[styles.cellWrap, { width: cellW }]}>
            {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
            {s.onPress ? (
              <PressableScale
                onPress={s.onPress}
                scaleTo={0.94}
                accessibilityRole="button"
                accessibilityLabel={`${s.label}: ${s.value}`}
                style={styles.cell}
              >
                {content}
              </PressableScale>
            ) : (
              <View style={styles.cell} accessible accessibilityLabel={`${s.label}: ${s.value}`}>
                {content}
              </View>
            )}
          </View>
        );
      })}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.lg,
    paddingHorizontal: CARD_PAD,
  },
  cellWrap: { flexDirection: 'row', alignItems: 'stretch' },
  sep: { position: 'absolute', start: 0, top: space.sm, bottom: space.sm, width: StyleSheet.hairlineWidth },
  cell: { flex: 1, alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xxs,
  },
  iconCompact: { width: 30, height: 30, borderRadius: 15 },
  value: { alignSelf: 'stretch' },
  labelCompact: { fontSize: 11, lineHeight: 14 },
});
