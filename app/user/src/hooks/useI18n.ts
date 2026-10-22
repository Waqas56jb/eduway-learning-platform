import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Namespace } from '@/i18n';
import { useLangStore } from '@/store/langStore';
import type { Localized } from '@/types';

/**
 * Translation + localization helpers.
 *   const { t, L, lang, isAr } = useI18n('home');
 *   t('greeting.evening', { name })   // from locales/<lang>/home.json
 *   t('common:actions.continue')      // other namespace
 *   L(subject.name)                    // pick en/ar from a Localized API field
 */
export function useI18n(ns: Namespace | Namespace[] = 'common') {
  const { t, i18n } = useTranslation(ns);
  const lang = useLangStore((s) => s.lang);
  const isAr = lang === 'ar';
  const L = useCallback((v: Localized | undefined | null) => (v ? v[lang] ?? v.en : ''), [lang]);
  return { t, i18n, lang, isAr, L };
}
