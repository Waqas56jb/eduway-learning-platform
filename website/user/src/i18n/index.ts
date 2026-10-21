import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ar from './ar.json';

/**
 * Translations live in `en.json` / `ar.json` (shared UI strings) plus one file per feature area
 * under `locales/<lang>/<area>.json`. Feature files are merged under their file name, so
 * `locales/en/landing.json` is addressed as `t('landing.hero.title')`.
 */
type Dict = Record<string, unknown>;
const modules = import.meta.glob<{ default: Dict }>('./locales/*/*.json', { eager: true });

function buildResources(lang: 'en' | 'ar', base: Dict): Dict {
  const merged: Dict = { ...base };
  for (const [path, mod] of Object.entries(modules)) {
    const m = path.match(/\.\/locales\/(en|ar)\/(.+)\.json$/);
    if (m && m[1] === lang) merged[m[2]] = mod.default;
  }
  return merged;
}

export const LANG_STORAGE_KEY = 'eduway.lang';

const stored = (() => {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return null;
  }
})();

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: buildResources('en', en) },
    ar: { translation: buildResources('ar', ar) },
  },
  lng: stored === 'en' || stored === 'ar' ? stored : 'ar',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
