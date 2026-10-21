import { useCallback } from 'react';
import { useI18n } from '@/hooks/useI18n';

/** Translates a zod message key (e.g. "mobile.length") from the `validation` namespace. */
export function useFieldError() {
  const { t } = useI18n('validation');
  return useCallback(
    (message: string | undefined): string | undefined => (message ? t(`validation:${message}`) : undefined),
    [t],
  );
}
