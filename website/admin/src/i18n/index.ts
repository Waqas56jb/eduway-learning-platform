import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ar from './ar.json';

export const LANG_KEY = 'eduway.admin.lang';

type Dict = Record<string, unknown>;

/**
 * Module namespaces live in ./modules/<name>.en.json and <name>.ar.json and are
 * merged under the `<name>` key, so `t('users.title')` reads modules/users.en.json → title.
 */
const moduleFiles = import.meta.glob<Dict>('./modules/*.json', { eager: true, import: 'default' });

function collect(lang: 'en' | 'ar'): Dict {
  const out: Dict = {};
  for (const [path, dict] of Object.entries(moduleFiles)) {
    const m = path.match(/\/([\w-]+)\.(en|ar)\.json$/);
    if (m && m[2] === lang) out[m[1]] = dict;
  }
  return out;
}

const stored = (() => {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
})();
const initial = stored === 'ar' || stored === 'en' ? stored : (import.meta.env.VITE_DEFAULT_LANG ?? 'en');

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...en, ...collect('en') } },
    ar: { translation: { ...ar, ...collect('ar') } },
  },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function applyDocumentLang(lang: string) {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

applyDocumentLang(i18n.language);
i18n.on('languageChanged', (lng) => {
  applyDocumentLang(lng);
  try {
    localStorage.setItem(LANG_KEY, lng);
  } catch {
    /* storage unavailable */
  }
});

export default i18n;
