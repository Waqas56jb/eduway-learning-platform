import { Platform, type ViewStyle } from 'react-native';

function make(y: number, blur: number, opacity: number, elevation: number, color = '#0B1F3A'): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: { shadowColor: color, shadowOffset: { width: 0, height: y }, shadowOpacity: opacity, shadowRadius: blur },
    default: { elevation, shadowColor: color },
  });
}

export const shadows = {
  none: {} as ViewStyle,
  sm: make(2, 6, 0.06, 2),
  md: make(6, 16, 0.08, 4),
  lg: make(12, 28, 0.12, 8),
  gold: make(8, 20, 0.35, 6, '#C9A24A'),
};
