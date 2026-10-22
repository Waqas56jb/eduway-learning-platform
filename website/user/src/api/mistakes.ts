import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { get, getPaged, patch, post, qs } from './client';
import { keys } from './keys';
import type { MistakeEntry, MistakeRetryDto, MistakesMeta, MistakeStatus, MistakeSummaryDto, Paged } from './types';

export interface MistakeListParams {
  status?: MistakeStatus | 'repeated';
  subjectId?: string;
  unitId?: string;
  topicId?: string;
  source?: string;
  groupBy?: 'subject' | 'unit' | 'topic' | 'date';
  sort?: '-date' | 'repeatCount' | '-repeatCount';
  page?: number;
  pageSize?: number;
}

/** Mistakes (MST-01…05). */
export const mistakesApi = {
  list: (p: MistakeListParams) => getPaged<MistakeEntry, MistakesMeta>(`/mistakes${qs({ pageSize: 100, ...p })}`),
  summary: () => get<MistakeSummaryDto>('/mistakes/summary'),
  get: (id: string) => get<MistakeEntry & { nextUnresolvedId: string | null }>(`/mistakes/${id}`),
  setStatus: (id: string, status: MistakeStatus) => patch<MistakeEntry>(`/mistakes/${id}`, { status }),
  retry: (id: string, body: { optionId?: string; chosenIndex?: number; textAnswer?: string }) =>
    post<MistakeRetryDto>(`/mistakes/${id}/retry`, body),
};

export function useMistakes(params: MistakeListParams = {}) {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: keys.mistakeList(params as Record<string, unknown>), queryFn: () => mistakesApi.list(params), enabled: isAuthenticated });
}

export function useMistakeSummary() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: keys.mistakeSummary, queryFn: mistakesApi.summary, enabled: isAuthenticated });
}

function patchEntry(qc: ReturnType<typeof useQueryClient>, entry: MistakeEntry) {
  qc.setQueriesData<Paged<MistakeEntry, MistakesMeta>>({ queryKey: [...keys.mistakes, 'list'] }, (old) =>
    old ? { ...old, items: old.items.map((m) => (m.id === entry.id ? entry : m)) } : old,
  );
}

export function useSetMistakeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: MistakeStatus }) => mistakesApi.setStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: keys.mistakes });
      const snapshots = qc.getQueriesData<Paged<MistakeEntry, MistakesMeta>>({ queryKey: [...keys.mistakes, 'list'] });
      qc.setQueriesData<Paged<MistakeEntry, MistakesMeta>>({ queryKey: [...keys.mistakes, 'list'] }, (old) =>
        old ? { ...old, items: old.items.map((m) => (m.id === id ? { ...m, status } : m)) } : old,
      );
      return { snapshots };
    },
    onError: (_e, _v, ctx) => ctx?.snapshots.forEach(([k, d]) => qc.setQueryData<Paged<MistakeEntry, MistakesMeta>>(k, d)),
    onSuccess: (entry) => patchEntry(qc, entry),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.mistakes });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useRetryMistake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; optionId?: string; chosenIndex?: number }) => mistakesApi.retry(id, body),
    onSuccess: (res) => patchEntry(qc, res.mistake),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.mistakeSummary });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}
