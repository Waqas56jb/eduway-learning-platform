import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Lang } from '@/types';

export function useLang(): Lang {
  const { i18n } = useTranslation();
  return i18n.language === 'ar' ? 'ar' : 'en';
}

export const useIsRtl = () => useLang() === 'ar';

/**
 * Pick the active-language variant of a bilingual field.
 * `const L = useLocalize(); L(subject, 'name')` → subject.name_ar in Arabic, subject.name_en otherwise.
 */
export function useLocalize() {
  const lang = useLang();
  return useCallback(
    <T extends object>(obj: T | null | undefined, field: string): string => {
      if (!obj) return '—';
      const rec = obj as Record<string, unknown>;
      const v = rec[`${field}_${lang}`] ?? rec[`${field}_en`] ?? rec[field];
      return typeof v === 'string' && v ? v : '—';
    },
    [lang],
  );
}
