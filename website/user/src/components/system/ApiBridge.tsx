import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { apiEvents } from '@/api/events';
import { keys } from '@/api/keys';
import { queryClient, setErrorReporter } from '@/api/queryClient';
import { useToast } from '@/components/ui';
import { lockedPlansPath } from '@/lib/plans';

/**
 * Connects the React-agnostic API layer to the UI:
 *  - failed requests → localized toast (locked content gets a "View plans" action → subscription page)
 *  - LEGAL_ACCEPTANCE_REQUIRED → refresh /auth/me so the re-acceptance prompt appears
 */
export function ApiBridge() {
  const toast = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    setErrorReporter((e) => {
      if (e.isLocked) {
        const locked = e.locked;
        toast.show({
          type: 'warning',
          title: errorMessage(e),
          duration: 6000,
          action: {
            label: t('errors.viewPlans'),
            onClick: () => navigate(lockedPlansPath(locked)),
          },
        });
        return;
      }
      toast.error(errorMessage(e));
    });
    return () => setErrorReporter(null);
  }, [toast, navigate, t]);

  useEffect(
    () =>
      apiEvents.on('legalRequired', () => {
        void queryClient.invalidateQueries({ queryKey: keys.me });
      }),
    [],
  );

  return null;
}
