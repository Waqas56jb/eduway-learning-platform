import { Image } from 'expo-image';
import { useWindowDimensions } from 'react-native';
import { Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, SCREEN_PADDING } from '@/theme';

/** White/gold tints used on the dark cinematic onboarding surfaces (brand palette, theme independent). */
export const ink = {
  white: palette.white,
  soft: 'rgba(255,255,255,0.8)',
  faint: 'rgba(255,255,255,0.6)',
  glass: 'rgba(255,255,255,0.10)',
  glassStrong: 'rgba(255,255,255,0.16)',
  hairline: 'rgba(255,255,255,0.24)',
  gold: palette.gold,
  goldHi: palette.goldLight,
  navy900: palette.navy900,
} as const;

export const CTA_HEIGHT = 56;
export const EASE_OUT = Easing.out(Easing.cubic);
export const EASE_IN_OUT = Easing.inOut(Easing.sin);

const unsplash = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1400&q=80`;

export interface CinematicImage {
  uri: string;
  /** Per-photo 4×4 blurhash so the placeholder already carries the photo's mood. */
  blurhash: string;
}

/** Curated full-bleed photography (all URLs verified HTTP 200). */
export const onboardingMedia = {
  /** Lecture hall — a teacher in front of an attentive class. */
  learn: { uri: unsplash('photo-1524178232363-1fb2b075b655'), blurhash: 'UDC%BLogEMM_?^WV%1WBI9owozogrqV@NHkA' },
  /** Pencil on a bubble answer sheet — the ministerial exam. */
  practice: { uri: unsplash('photo-1606326608606-aa0b62935f2b'), blurhash: 'ULHxjI?c%gx^elx^-;tSVYMx-pt7.TIUoIR*' },
  /** Student focused on a laptop late at night. */
  tutor: { uri: unsplash('photo-1513258496099-48168024aec0'), blurhash: 'UcEfj2vzs.x]8^%gxujEI;IoRiWBt7MxM|WX' },
  /** Graduates throwing caps into a sunset sky. */
  welcome: { uri: unsplash('photo-1541339907198-e08756dedf3f'), blurhash: 'U,LD=Dt6WWof~qj]j[ofENWCoej[E2WCj[ay' },
} satisfies Record<string, CinematicImage>;

/** Warm the disk/memory cache for every onboarding photo so slides never pop in. */
export function prefetchOnboardingMedia(): void {
  void Image.prefetch(
    Object.values(onboardingMedia).map((m) => m.uri),
    'memory-disk',
  ).catch(() => false);
}

/** Split a copy line into plain and `*highlighted*` segments. */
export function parseHighlight(line: string): { text: string; hi: boolean }[] {
  return line
    .split('*')
    .map((text, i) => ({ text, hi: i % 2 === 1 }))
    .filter((s) => s.text.length > 0);
}

/** Strip highlight markers / line breaks for accessibility labels. */
export function plainCopy(text: string): string {
  return text.replace(/\*/g, '').replace(/\s*\n\s*/g, ' ');
}

/** Responsive sizes for the cinematic screens (320pt → 430pt wide, short → tall). */
export function useCinematicMetrics() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height < 720;
  const tiny = height < 620;
  const gutter = width >= 400 ? SCREEN_PADDING + 4 : SCREEN_PADDING;
  const titleSize = Math.round(
    Math.max(30, Math.min(40, Math.max(30, width * 0.094)) - (compact ? 2 : 0) - (tiny ? 2 : 0)),
  );
  const bottomPad = insets.bottom > 0 ? insets.bottom + 4 : 20;
  return {
    width,
    height,
    insets,
    compact,
    tiny,
    gutter,
    titleSize,
    bottomPad,
    contentWidth: Math.min(width - gutter * 2, 460),
  };
}
