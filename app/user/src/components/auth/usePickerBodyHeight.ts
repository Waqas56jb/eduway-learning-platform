import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '@/theme';
import { useKeyboard } from './useKeyboard';

/** Approximate BottomSheet chrome: drag handle (21) + title row (52) + content top padding (4). */
const SHEET_CHROME = 77;
/** BottomSheet footer: top padding (12) + 44pt button. */
const FOOTER_BODY = 56;
const SAFETY = 12;

/**
 * Height for a picker sheet's body (search + list) so the whole sheet — including the search field —
 * always fits on screen, with or without the keyboard. Use with `snap="auto"` + `scrollable={false}`.
 */
export function usePickerBodyHeight(hasFooter: boolean): number {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboard();

  const bottomPad = Math.max(insets.bottom, space.lg);
  const footer = hasFooter ? FOOTER_BODY + bottomPad : bottomPad;
  const chrome = SHEET_CHROME + footer + SAFETY;

  const relaxed = Math.min(Math.round(screenH * 0.72), Math.round(screenH * 0.9) - chrome);
  if (!keyboard.visible) return Math.max(200, relaxed);

  // Android resizes the window itself, so only iOS needs to subtract the keyboard.
  const kb = Platform.OS === 'ios' ? keyboard.height : 0;
  const available = screenH - kb - insets.top - space.md - chrome;
  return Math.max(150, Math.min(relaxed, available));
}
