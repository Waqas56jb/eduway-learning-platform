import { memo, useId } from 'react';
import { I18nManager, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G } from 'react-native-svg';
import { useTheme } from '@/theme';
import { useLangStore } from '@/store/langStore';
import { DIRECTIONAL_ICONS, glyphs, type IconName } from './paths';

export type { IconName } from './paths';
export { ICON_NAMES } from './paths';

export interface IconProps {
  name: IconName;
  /** px, default 24 */
  size?: number;
  /** defaults to theme `ink` */
  color?: string;
  /** default 1.75 (on the 24px grid) */
  strokeWidth?: number;
  /** filled / duotone variant (active tab state etc.) */
  filled?: boolean;
  /** Override automatic RTL mirroring (directional icons mirror by default). */
  mirrorInRTL?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

function IconBase({
  name,
  size = 24,
  color,
  strokeWidth = 1.75,
  filled = false,
  mirrorInRTL,
  style,
  accessibilityLabel,
}: IconProps) {
  const { colors } = useTheme();
  const isAr = useLangStore((s) => s.isAr);
  const rawId = useId();
  const id = `ic${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const c = color ?? colors.ink;
  const render = glyphs[name];
  const shouldMirror = (mirrorInRTL ?? DIRECTIONAL_ICONS.has(name)) && (I18nManager.isRTL || isAr);

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={[shouldMirror ? { transform: [{ scaleX: -1 }] } : null, style]}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
    >
      <G
        stroke={c}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {render({ c, f: filled, id, sw: strokeWidth })}
      </G>
    </Svg>
  );
}

export const Icon = memo(IconBase);
Icon.displayName = 'Icon';
