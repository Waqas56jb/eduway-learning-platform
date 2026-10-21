import { memo } from 'react';
import Svg, { Path } from 'react-native-svg';

interface ThumbIconProps {
  direction: 'up' | 'down';
  size?: number;
  color: string;
  filled?: boolean;
}

/** Thumbs up/down glyph (not part of the shared icon set). */
export const ThumbIcon = memo(function ThumbIcon({ direction, size = 18, color, filled = false }: ThumbIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={direction === 'down' ? { transform: [{ rotate: '180deg' }] } : undefined}
    >
      <Path
        d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
      <Path
        d="M7 10l4-7a2.5 2.5 0 0 1 2.9 2.9L13.2 9H19a2 2 0 0 1 2 2.3l-1.3 7.5A2.6 2.6 0 0 1 17.1 21H7"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill={filled ? color : 'none'}
        fillOpacity={filled ? 0.18 : 0}
      />
    </Svg>
  );
});
