import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import * as Updates from 'expo-updates';
import { DevSettings, I18nManager } from 'react-native';
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
  /**
   * Switch language. Persists, updates i18next immediately and, when the layout
   * direction must flip, forces RTL/LTR natively and reloads the JS bundle.
   */
  setLanguage: (lang: Lang) => Promise<void>;
}

function detectDeviceLang(): Lang {
  const code = Localization.getLocales()[0]?.languageCode;
  if (code === 'en') return 'en';
  return 'ar';
}

function applyDirection(lang: Lang): boolean {
  const wantRTL = lang === 'ar';
  I18nManager.allowRTL(true);
  I18nManager.swapLeftAndRightInRTL(true);
  if (I18nManager.isRTL !== wantRTL) {
    I18nManager.forceRTL(wantRTL);
    return true;
  }
  return false;
}

async function reloadApp() {
  try {
    await Updates.reloadAsync();
  } catch {
    // expo-updates is disabled in development builds; fall back to a dev reload.
    if (__DEV__) DevSettings.reload();
  }
}

export const useLangStore = create<LangState>()((set) => ({
  lang: 'ar',
  isAr: true,
  ready: false,
  init: async () => {
    let lang: Lang;
    try {
      const saved = await AsyncStorage.getItem(LANG_KEY);
      lang = saved === 'en' || saved === 'ar' ? saved : detectDeviceLang();
    } catch {
      lang = 'ar';
    }
    await i18n.changeLanguage(lang);
    applyDirection(lang);
    set({ lang, isAr: lang === 'ar', ready: true });
  },
  setLanguage: async (lang) => {
    await AsyncStorage.setItem(LANG_KEY, lang);
    await i18n.changeLanguage(lang);
    set({ lang, isAr: lang === 'ar' });
    if (applyDirection(lang)) {
      // Give the UI a moment to show the new language before reloading for RTL.
      setTimeout(reloadApp, 350);
    }
  },
}));
