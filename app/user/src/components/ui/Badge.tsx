import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { fontFor, palette, radius, useTheme } from '@/theme';
import { useLangStore } from '@/store/langStore';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'gold' | 'navy' | 'success' | 'warning' | 'danger' | 'info' | 'subject';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Base color when tone = 'subject' (any hex). */
  color?: string;
  icon?: IconName;
  size?: 'sm' | 'md';
  /** Solid (filled) instead of the soft tint. */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Append an alpha channel to a #RRGGBB color. */
function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

/** Small status pill. */
export const Badge = memo(function Badge({ label, tone = 'neutral', color, icon, size = 'sm', solid, style }: BadgeProps) {
  const { colors, isDark } = useTheme();
  const isAr = useLangStore((s) => s.isAr);

  let fg: string;
  let bg: string;
  switch (tone) {
    case 'gold':
      fg = isDark ? colors.accentLight : '#8A6A22';
      bg = colors.accentSoft;
      break;
    case 'navy':
      fg = isDark ? colors.ink : palette.navy;
      bg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(11,31,58,0.08)';
      break;
    case 'success':
      fg = colors.success;
      bg = colors.successSoft;
      break;
    case 'warning':
      fg = isDark ? colors.warning : '#B45309';
      bg = colors.warningSoft;
      break;
    case 'danger':
      fg = colors.danger;
      bg = colors.dangerSoft;
      break;
    case 'info':
      fg = colors.info;
      bg = colors.infoSoft;
      break;
    case 'subject': {
      const base = color ?? colors.accent;
      fg = base;
      bg = withAlpha(base, isDark ? 0.2 : 0.12);
      break;
    }
    default:
      fg = colors.muted;
      bg = colors.surfaceMuted;
  }

  if (solid) {
    const solidBg =
      tone === 'gold' ? colors.accent : tone === 'navy' ? palette.navy : tone === 'neutral' ? colors.muted : tone === 'subject' ? color ?? colors.accent : fg;
    bg = solidBg;
    fg = tone === 'gold' ? palette.navy : '#FFFFFF';
  }

  const isSm = size === 'sm';

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: bg, height: isSm ? 22 : 28, paddingHorizontal: isSm ? 8 : 10, gap: isSm ? 4 : 6 },
        style,
      ]}
      accessibilityRole="text"
    >
      {icon ? <Icon name={icon} size={isSm ? 12 : 14} color={fg} strokeWidth={2.2} /> : null}
      <Text variant={isSm ? 'caption' : 'label'} color={fg} numberOfLines={1} style={{ fontFamily: fontFor('semibold', isAr) }}>
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
  },
});
