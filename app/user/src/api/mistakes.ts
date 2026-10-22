import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, getPaged, patch, post } from './client';
import { qk } from './keys';
import type {
  MistakeEntryDto,
  MistakeRetryDto,
  MistakeStatus,
  MistakeSummaryDto,
  MistakesMeta,
  MistakesQuery,
} from './types';

// MST-01
export const useMistakes = (query: MistakesQuery = {}) =>
  useQuery({
    queryKey: qk.mistakes.list(query),
    queryFn: () => getPaged<MistakeEntryDto, MistakesMeta>('/mistakes', { pageSize: 100, ...query }),
  });

// MST-02
export const useMistakeSummary = () =>
  useQuery({
    queryKey: qk.mistakes.summary,
    queryFn: () => get<MistakeSummaryDto>('/mistakes/summary'),
    meta: { silent: true },
  });

// MST-03
export const useMistake = (id: string | undefined) =>
  useQuery({
    queryKey: qk.mistakes.detail(id ?? ''),
    queryFn: () => get<MistakeEntryDto & { nextUnresolvedId: string | null }>(`/mistakes/${id}`),
    enabled: !!id,
  });

// MST-04 (optimistic status change in every cached list)
export function useSetMistakeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: MistakeStatus }) => patch<MistakeEntryDto>(`/mistakes/${id}`, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['mistakes', 'list'] });
      const snapshots = qc.getQueriesData<{ items: MistakeEntryDto[]; meta: MistakesMeta }>({ queryKey: ['mistakes', 'list'] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData(key, { ...data, items: data.items.map((m) => (m.id === id ? { ...m, status } : m)) });
      }
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.mistakes.all });
      void qc.invalidateQueries({ queryKey: qk.progress.dashboard });
    },
  });
}

// MST-05
export const retryMistake = (id: string, body: { optionId?: string; chosenIndex?: number; textAnswer?: string }) =>
  post<MistakeRetryDto>(`/mistakes/${id}/retry`, body);

export function useRetryMistake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; optionId?: string; chosenIndex?: number }) => retryMistake(id, body),
    onSuccess: (res, { id }) => {
      qc.setQueryData(qk.mistakes.detail(id), { ...res.mistake, nextUnresolvedId: res.nextUnresolvedId });
      void qc.invalidateQueries({ queryKey: ['mistakes', 'list'] });
      void qc.invalidateQueries({ queryKey: qk.mistakes.summary });
      void qc.invalidateQueries({ queryKey: qk.progress.dashboard });
    },
  });
}
