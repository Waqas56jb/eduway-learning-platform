import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { palette, radius, SCREEN_PADDING, shadows, space, useTheme } from '@/theme';
import { withAlpha } from './color';

interface QuickAction {
  key: 'questionBank' | 'mistakes' | 'exams' | 'progress';
  icon: IconName;
  href: Href;
  color: string;
}

const ACTIONS: QuickAction[] = [
  { key: 'questionBank', icon: 'question-bank', href: '/question-bank', color: '#2563EB' },
  { key: 'mistakes', icon: 'mistakes', href: '/mistakes', color: '#DC2626' },
  { key: 'exams', icon: 'exam', href: '/exams', color: palette.gold },
  { key: 'progress', icon: 'chart', href: '/progress', color: '#059669' },
];

const GAP = space.md;

/** 2×2 grid of equal shortcut tiles (width computed from the window). */
export const QuickActions = memo(function QuickActions() {
  const { colors, isDark } = useTheme();
  const { t } = useI18n('home');
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor((width - SCREEN_PADDING * 2 - GAP) / 2);

  return (
    <View style={styles.grid}>
      {ACTIONS.map((a) => {
        const label = t(`quick.${a.key}`);
        return (
          <PressableScale
            key={a.key}
            onPress={() => router.push(a.href)}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={[
              styles.tile,
              { width: tileWidth, backgroundColor: colors.surface, borderColor: colors.border },
              !isDark && shadows.sm,
            ]}
          >
            <View style={[styles.icon, { backgroundColor: withAlpha(a.color, isDark ? 0.24 : 0.12) }]}>
              <Icon name={a.icon} size={20} color={a.color} />
            </View>
            <Text variant="label" numberOfLines={2} style={styles.label}>
              {label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 68,
    paddingHorizontal: space.md + 2,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1 },
});
