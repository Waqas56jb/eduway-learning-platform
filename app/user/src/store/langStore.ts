import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { I18nManager } from 'react-native';
import { create } from 'zustand';
import i18n from '@/i18n';
import type { Lang } from '@/types';

const LANG_KEY = 'eduway.lang';

interface LangState {
  lang: Lang;
  isAr: boolean;
  ready: boolean;
  /** Load the persisted language (or device locale on first launch, defaulting to Arabic). */
  init: () => Promise<void>;
  /** Switch language instantly: persists, updates i18next and flips the root layout direction. */
  setLanguage: (lang: Lang) => Promise<void>;
}

function detectDeviceLang(): Lang {
  const code = Localization.getLocales()[0]?.languageCode;
  if (code === 'en') return 'en';
  return 'ar';
}

/**
 * Keep the native layout direction LTR. RTL is applied by the root view's Yoga `direction`
 * (see `src/utils/rtl.ts`), which needs no reload and works identically in Expo Go and store builds.
 * Undo any native RTL that an earlier build may have persisted on the device.
 */
function resetNativeDirection() {
  if (I18nManager.isRTL || I18nManager.doLeftAndRightSwapInRTL) {
    I18nManager.allowRTL(false);
    I18nManager.forceRTL(false);
    I18nManager.swapLeftAndRightInRTL(false);
  }
}

export const useLangStore = create<LangState>()((set) => ({
  lang: 'ar',
  isAr: true,
  ready: false,
  init: async () => {
    resetNativeDirection();
    let lang: Lang;
    try {
      const saved = await AsyncStorage.getItem(LANG_KEY);
      lang = saved === 'en' || saved === 'ar' ? saved : detectDeviceLang();
    } catch {
      lang = 'ar';
    }
    await i18n.changeLanguage(lang);
    set({ lang, isAr: lang === 'ar', ready: true });
  },
  setLanguage: async (lang) => {
    await AsyncStorage.setItem(LANG_KEY, lang);
    await i18n.changeLanguage(lang);
    set({ lang, isAr: lang === 'ar' });
  },
}));
