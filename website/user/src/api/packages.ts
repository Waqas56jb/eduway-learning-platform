import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { get } from './client';
import { keys } from './keys';
import type { PackagePublic } from './types';

/** Packages (PAY-01/02). Optional auth adds `isCurrent`. */
export const packagesApi = {
  list: () => get<PackagePublic[]>('/packages'),
  get: (id: string) => get<PackagePublic>(`/packages/${id}`),
};

export function usePackages() {
  const { isAuthenticated, status } = useAuth();
  return useQuery({
    queryKey: keys.packages(isAuthenticated),
    queryFn: packagesApi.list,
    staleTime: 5 * 60 * 1000,
    enabled: status !== 'loading',
  });
}

/** Lookup by id from the cached package list. */
export function usePackageLookup() {
  const { data } = usePackages();
  return (id: string | null | undefined) => (id ? data?.find((p) => p.id === id) : undefined);
}
