import { createContext, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { LANG_STORAGE_KEY } from '@/i18n';
import type { Lang, Localized } from '@/types';

export interface LangContextValue {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  isRtl: boolean;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  /** Pick the active-language field of a bilingual value. */
  l: (v: Localized | undefined) => string;
  fmtNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;
  fmtDate: (iso: string | Date, opts?: Intl.DateTimeFormatOptions) => string;
  fmtRelative: (iso: string) => string;
}

export const LangContext = createContext<LangContextValue | null>(null);

// Latin digits in both languages keep numbers readable and consistent with the
// ministerial exam papers students are used to.
const localeFor = (lang: Lang) => (lang === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-GB');

export function LangProvider({ children }: { children: ReactNode }) {
  const { i18n: inst } = useTranslation();
  const lang: Lang = inst.language === 'en' ? 'en' : 'ar';
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      /* storage unavailable */
    }
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => void i18n.changeLanguage(l), []);
  const toggleLang = useCallback(() => setLang(lang === 'ar' ? 'en' : 'ar'), [lang, setLang]);

  const value = useMemo<LangContextValue>(() => {
    const loc = localeFor(lang);
    const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
    return {
      lang,
      dir,
      isRtl: dir === 'rtl',
      setLang,
      toggleLang,
      l: (v) => (v ? (v[lang] ?? v.en) : ''),
      fmtNumber: (n, opts) => new Intl.NumberFormat(loc, opts).format(n),
      fmtDate: (iso, opts) =>
        new Intl.DateTimeFormat(loc, opts ?? { day: 'numeric', month: 'short', year: 'numeric' }).format(
          typeof iso === 'string' ? new Date(iso) : iso,
        ),
      fmtRelative: (iso) => {
        const diff = (new Date(iso).getTime() - Date.now()) / 1000;
        const abs = Math.abs(diff);
        if (abs < 60) return rtf.format(Math.round(diff), 'second');
        if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
        if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
        if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
        return rtf.format(Math.round(diff / (86400 * 30)), 'month');
      },
    };
  }, [lang, dir, setLang, toggleLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
