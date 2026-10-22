import type { ViewStyle } from 'react-native';
import { useLangStore } from '@/store/langStore';

/**
 * Layout direction of the app. EDUWAY does not use native `I18nManager.forceRTL` (it needs an app
 * reload, which breaks inside Expo Go and makes language switching slow). Instead the root view sets
 * Yoga's `direction` from the language, so rows, start/end spacing and text alignment flip instantly.
 * Use this — never `I18nManager.isRTL` — for any geometry (translateX, chart axes, pager offsets).
 */
export const isRTL = (): boolean => useLangStore.getState().isAr;

/** Hook form of `isRTL` that re-renders on language change. */
export const useIsRTL = (): boolean => useLangStore((s) => s.isAr);

/** Style that sets the layout direction for a subtree (root view, and every Modal root). */
export const directionStyle = (rtl: boolean): ViewStyle => ({ direction: rtl ? 'rtl' : 'ltr' });
