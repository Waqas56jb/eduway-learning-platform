import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, SubjectIcon } from '@/components/icons';
import { PressableScale, ProgressRing, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, SCREEN_PADDING, shadows, space, subjectColors, useTheme } from '@/theme';
import type { Subject } from '@/types';

interface SubjectRingsProps {
  items: { subject: Subject; completion: number }[];
}

const COLUMNS = 3;
const GAP = space.md;

/** Per-subject completion rings in a 3-column grid (column width from the window). The last cell browses all subjects. */
export const SubjectRings = memo(function SubjectRings({ items }: SubjectRingsProps) {
  const { colors, isDark } = useTheme();
  const { t, L } = useI18n('progress');
  const { width } = useWindowDimensions();

  const colWidth = Math.floor((width - SCREEN_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const ringSize = Math.max(48, Math.min(68, colWidth - 32));
  const stroke = ringSize >= 60 ? 6 : 5;
  const tileStyle = [
    styles.tile,
    { width: colWidth, backgroundColor: colors.surface, borderColor: colors.border },
    !isDark && shadows.sm,
  ];

  return (
    <View style={styles.grid}>
      {items.map(({ subject, completion }) => {
        const color = subjectColors[subject.id];
        const name = L(subject.name);
        return (
          <PressableScale
            key={subject.id}
            onPress={() => router.push({ pathname: '/subject/[id]', params: { id: subject.id } })}
            accessibilityRole="button"
            accessibilityLabel={t('subjects.a11y', { subject: name, value: completion })}
            style={tileStyle}
          >
            <ProgressRing
              progress={completion}
              size={ringSize}
              strokeWidth={stroke}
              color={color}
              trackColor={colors.surfaceMuted}
            />
            <View style={styles.nameRow}>
              <SubjectIcon subjectId={subject.id} size={13} color={color} />
              <Text variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.name}>
                {name}
              </Text>
            </View>
          </PressableScale>
        );
      })}

      <PressableScale
        onPress={() => router.navigate('/(tabs)/subjects')}
        accessibilityRole="button"
        accessibilityLabel={t('subjects.viewAllA11y')}
        style={[tileStyle, styles.allTile, { backgroundColor: colors.surfaceMuted }]}
      >
        <View style={[styles.allIcon, { width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderColor: colors.accent }]}>
          <Icon name="grid" size={Math.round(ringSize * 0.36)} color={colors.accent} />
        </View>
        <View style={styles.nameRow}>
          <Text variant="label" color={isDark ? colors.accentLight : '#8A6A22'} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.name}>
            {t('subjects.viewAll')}
          </Text>
        </View>
      </PressableScale>
    </View>
  );
});

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: {
    alignItems: 'center',
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.md,
  },
  allTile: { borderStyle: 'dashed' },
  allIcon: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, maxWidth: '100%' },
  name: { flexShrink: 1 },
});
