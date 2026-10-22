import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { get } from './client';
import { keys } from './keys';
import type { MySubscription } from './types';

/** Current subscription (PAY-03). */
export const subscriptionsApi = {
  my: () => get<MySubscription | null>('/subscriptions/my'),
};

export function useMySubscription() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: keys.mySubscription, queryFn: subscriptionsApi.my, enabled: isAuthenticated });
}

/** Re-reads everything that depends on entitlements after a purchase. */
export function useRefreshEntitlements() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.me }),
      qc.invalidateQueries({ queryKey: keys.mySubscription }),
      qc.invalidateQueries({ queryKey: keys.myPayments }),
      qc.invalidateQueries({ queryKey: keys.packagesAll }),
      qc.invalidateQueries({ queryKey: ['catalog'] }),
      qc.invalidateQueries({ queryKey: ['lessons'] }),
      qc.invalidateQueries({ queryKey: keys.progress }),
      qc.invalidateQueries({ queryKey: keys.ai }),
      qc.invalidateQueries({ queryKey: keys.exams }),
      qc.invalidateQueries({ queryKey: keys.bank }),
    ]);
}
