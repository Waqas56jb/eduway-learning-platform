import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, qs } from './client';
import { keys } from './keys';
import type { LegalDoc, LegalDocumentDto, MeStudentDto } from './types';

/** Legal documents (PUB-11) + re-acceptance (AUTH-08). */
export const legalApi = {
  get: (doc: LegalDoc, version?: string) => get<LegalDocumentDto>(`/legal/${doc}${qs({ version })}`, { skipAuth: true }),
  accept: (documents: { doc: LegalDoc; version: string }[]) =>
    post<{ pendingLegal: { doc: LegalDoc; version: string }[] }>('/auth/accept-legal', { documents }),
};

export const useLegalDocument = (doc: LegalDoc, enabled = true) =>
  useQuery({ queryKey: keys.legal(doc), queryFn: () => legalApi.get(doc), staleTime: 60 * 60 * 1000, enabled });

export function useAcceptLegal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: legalApi.accept,
    onSuccess: (res) => {
      qc.setQueryData<MeStudentDto | null>(keys.me, (me) => (me ? { ...me, user: { ...me.user, pendingLegal: res.pendingLegal } } : me));
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}
