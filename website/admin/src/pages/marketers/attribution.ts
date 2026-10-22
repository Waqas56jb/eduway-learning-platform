import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { isApiError, toastError } from '@/api/client';
import { partnerKeys } from '@/api/partners';
import type { Localized } from '@/api/types';
import { useLang } from '@/hooks/useLocale';
import { useConfirm } from '@/components/ui';

interface GuardOptions<T> {
  /** School display name (for the dialog). */
  schoolName: string;
  /** Current marketer display name, when the school is already attributed. */
  currentMarketerName: string | null;
  /** Ask for an override reason up front (school attributed to a different marketer). */
  needsReason: boolean;
  /** The server call; receives the override reason when one was collected. */
  run: (overrideReason?: string) => Promise<T>;
}

/**
 * Double-attribution guard (contract ADM-SCH-09 / ADM-MKT-09): moving a school that already belongs to another
 * marketer requires an override reason. The reason is asked up front when we know about the conflict, and again if
 * the server answers 409 `DOUBLE_ATTRIBUTION` (stale data). Resolves `{ result, overridden }` or `null` (cancelled / failed).
 */
export function useAttributionGuard() {
  const { t } = useTranslation();
  const lang = useLang();
  const confirm = useConfirm();
  const qc = useQueryClient();

  const ask = async (school: string, marketer: string | null) => {
    const r = await confirm({
      title: t('marketers.detail.doubleTitle'),
      body: t('marketers.detail.doubleBody', { school, marketer: marketer ?? '—' }),
      tone: 'warning',
      confirmText: t('marketers.detail.override'),
      reason: { label: t('marketers.detail.overrideReason'), placeholder: t('marketers.detail.overridePlaceholder') },
    });
    return r?.reason ?? null;
  };

  return async function guarded<T>({ schoolName, currentMarketerName, needsReason, run }: GuardOptions<T>): Promise<{ result: T; overridden: boolean } | null> {
    let reason: string | undefined;
    if (needsReason) {
      const r = await ask(schoolName, currentMarketerName);
      if (!r) return null;
      reason = r;
    }
    try {
      const result = await run(reason);
      await Promise.all(partnerKeys.map((k) => qc.invalidateQueries({ queryKey: k })));
      return { result, overridden: !!reason };
    } catch (e) {
      if (isApiError(e) && e.reason === 'DOUBLE_ATTRIBUTION' && !reason) {
        const cur = e.details.currentMarketer as { name?: Localized } | undefined;
        const r = await ask(schoolName, cur?.name ? cur.name[lang] || cur.name.en : currentMarketerName);
        if (!r) return null;
        try {
          const result = await run(r);
          await Promise.all(partnerKeys.map((k) => qc.invalidateQueries({ queryKey: k })));
          return { result, overridden: true };
        } catch (e2) {
          toastError(e2);
          return null;
        }
      }
      toastError(e);
      return null;
    }
  };
}
