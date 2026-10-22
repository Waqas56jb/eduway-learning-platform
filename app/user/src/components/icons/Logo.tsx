import { memo, useId } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { palette } from '@/theme';

export type LogoVariant = 'gold' | 'navy' | 'light';

export interface LogoProps {
  /** badge / mark size in px, default 64 */
  size?: number;
  /** gold: gold mark on navy badge · navy: navy mark (light surfaces) · light: cream mark (dark surfaces) */
  variant?: LogoVariant;
  withWordmark?: boolean;
  /** wordmark placement, default 'below' */
  wordmarkPosition?: 'below' | 'beside';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/* Monogram geometry (100-unit space) — identical to assets/brand/*.svg */
const CAP_BOARD = 'M50 10 L88 25 L50 40 L12 25 Z';
const EDGE_HL = 'M13.5 25 L50 10.6 L86.5 25';
const CAP_BAND = 'M27 31 L50 40 L73 31 L73 41.5 Q50 50 27 41.5 Z';
const CORD_TOP = 'M50 25 C62 25.2 74 25.8 84.2 26.6';
const CORD = 'M84.2 26.6 V45';
const TASSEL = 'M81.6 45 H86.4 L88 57 H80 Z';
const LETTER_E =
  'M26.5 48 H71 V59.5 H68.4 C67.4 55.6 64.6 53.5 59.5 53.5 H43 V63.5 H55.5 C57.8 63.5 58.9 62.4 59.4 59.8 H61.8 V72.2 H59.4 C58.9 69.6 57.8 68.5 55.5 68.5 H43 V80.5 H61 C66 80.5 68.6 78.4 69.8 73.5 H72.4 V86 H26.5 V84.2 C29.8 84 31 83 31 80.5 V53.5 C31 51 29.8 50 26.5 49.8 Z';

const MARK_COLORS: Record<Exclude<LogoVariant, 'gold'>, { face: string; band: string; detail: string }> = {
  navy: { face: palette.navy, band: palette.navyLight, detail: palette.gold },
  light: { face: palette.cream, band: '#D9D3C7', detail: palette.gold },
};

const WORDMARK_COLOR: Record<LogoVariant, string> = {
  gold: palette.gold,
  navy: palette.navy,
  light: palette.cream,
};

function LogoBase({
  size = 64,
  variant = 'gold',
  withWordmark = false,
  wordmarkPosition = 'below',
  style,
  accessibilityLabel = 'EDUWAY',
}: LogoProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gold = `lg${uid}`;
  const band = `lb${uid}`;
  const glow = `lr${uid}`;
  const isGold = variant === 'gold';
  const mc = isGold ? null : MARK_COLORS[variant];
  const face = mc ? mc.face : `url(#${gold})`;
  const bandFill = mc ? mc.band : `url(#${band})`;
  const cordTop = mc ? mc.detail : '#9C7A2E';
  const cord = mc ? mc.detail : `url(#${gold})`;
  // badge variant shrinks the mark inside the rounded square
  const markScale = isGold ? 0.74 : 1.18;

  const mark = (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={gold} x1="20" y1="10" x2="80" y2="88" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#F3DD9A" />
          <Stop offset="0.45" stopColor={palette.goldLight} />
          <Stop offset="0.75" stopColor={palette.gold} />
          <Stop offset="1" stopColor="#A9832F" />
        </LinearGradient>
        <LinearGradient id={band} x1="27" y1="31" x2="73" y2="48" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#B8913C" />
          <Stop offset="1" stopColor="#8E6D26" />
        </LinearGradient>
        <RadialGradient id={glow} cx="50" cy="38" r="70" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#1D3F70" />
          <Stop offset="0.5" stopColor={palette.navyLight} />
          <Stop offset="1" stopColor={palette.navy} />
        </RadialGradient>
      </Defs>
      {isGold ? (
        <>
          <Rect x="0" y="0" width="100" height="100" rx="24" fill={`url(#${glow})`} />
          <Rect
            x="1"
            y="1"
            width="98"
            height="98"
            rx="23"
            fill="none"
            stroke={palette.gold}
            strokeOpacity={0.28}
            strokeWidth={1}
          />
        </>
      ) : null}
      <G transform={`translate(50 50) scale(${markScale}) translate(-50 -48)`}>
        <Path d={CAP_BOARD} fill={face} />
        {isGold ? (
          <Path d={EDGE_HL} stroke="#FFF1C4" strokeOpacity={0.7} strokeWidth={0.7} fill="none" strokeLinejoin="round" />
        ) : null}
        <Path d={CAP_BAND} fill={bandFill} />
        <Path d={CORD_TOP} stroke={cordTop} strokeWidth={1.6} strokeLinecap="round" fill="none" />
        <Circle cx="50" cy="25" r="2.6" fill={cordTop} />
        <Path d={LETTER_E} fill={face} />
        <Path d={CORD} stroke={cord} strokeWidth={2.2} strokeLinecap="round" fill="none" />
        <Path d={TASSEL} fill={cord} stroke={cord} strokeWidth={1} strokeLinejoin="round" />
      </G>
    </Svg>
  );

  if (!withWordmark) {
    return (
      <View style={style} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        {mark}
      </View>
    );
  }

  const beside = wordmarkPosition === 'beside';
  const fontSize = Math.round(size * (beside ? 0.42 : 0.3));
  return (
    <View
      style={[
        { alignItems: 'center' },
        beside ? { flexDirection: 'row', gap: size * 0.22 } : { gap: size * 0.16 },
        style,
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {mark}
      {/* Brand wordmark: fixed Playfair face in both languages (never localized). */}
      <Text
        allowFontScaling={false}
        style={{
          fontFamily: 'PlayfairDisplay_800ExtraBold',
          fontSize,
          lineHeight: Math.round(fontSize * 1.25),
          letterSpacing: fontSize * 0.22,
          color: WORDMARK_COLOR[variant],
          writingDirection: 'ltr',
          marginEnd: -fontSize * 0.22,
        }}
      >
        EDUWAY
      </Text>
    </View>
  );
}

export const Logo = memo(LogoBase);
Logo.displayName = 'Logo';
