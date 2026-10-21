import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { mistakes as seedMistakes } from '@/data';
import type { Mistake, MistakeStatus } from '@/types';
import { asyncJSONStorage } from './storage';

export interface RetryRecord {
  date: string; // ISO
  chosenIndex: number;
  correct: boolean;
}

export interface MistakeEntry extends Mistake {
  history: RetryRecord[];
}

/** UI filter; "repeated" = repeatCount >= 2 regardless of status. */
export type MistakeFilter = MistakeStatus | 'repeated';

interface MistakesState {
  mistakes: MistakeEntry[];
  /** Add a wrong answer. If the question is already logged, bumps repeatCount and re-opens it. */
  addMistake: (questionId: string, chosenIndex: number, source: Mistake['source']) => void;
  setStatus: (id: string, status: MistakeStatus) => void;
  /** Record a retry. Correct → 'mastered' (history kept); wrong → 'unresolved' + repeatCount++. */
  recordRetry: (id: string, chosenIndex: number, correct: boolean) => void;
  getById: (id: string) => MistakeEntry | undefined;
  filtered: (filter: MistakeFilter) => MistakeEntry[];
  unresolvedCount: () => number;
}

export const useMistakesStore = create<MistakesState>()(
  persist(
    (set, get) => ({
      mistakes: seedMistakes.map((m) => ({ ...m, history: [] })),

      addMistake: (questionId, chosenIndex, source) =>
        set((s) => {
          const existing = s.mistakes.find((m) => m.questionId === questionId);
          const now = new Date().toISOString();
          if (existing) {
            return {
              mistakes: s.mistakes.map((m) =>
                m.id === existing.id
                  ? { ...m, chosenIndex, status: 'unresolved', repeatCount: m.repeatCount + 1, date: now, source }
                  : m,
              ),
            };
          }
          const entry: MistakeEntry = {
            id: `m-${Date.now()}-${questionId}`,
            questionId,
            chosenIndex,
            status: 'unresolved',
            repeatCount: 1,
            date: now,
            source,
            history: [],
          };
          return { mistakes: [entry, ...s.mistakes] };
        }),
      setStatus: (id, status) => set((s) => ({ mistakes: s.mistakes.map((m) => (m.id === id ? { ...m, status } : m)) })),
      recordRetry: (id, chosenIndex, correct) =>
        set((s) => ({
          mistakes: s.mistakes.map((m) =>
            m.id === id
              ? {
                  ...m,
                  status: correct ? 'mastered' : 'unresolved',
                  repeatCount: correct ? m.repeatCount : m.repeatCount + 1,
                  chosenIndex: correct ? m.chosenIndex : chosenIndex,
                  history: [...m.history, { date: new Date().toISOString(), chosenIndex, correct }],
                }
              : m,
          ),
        })),
      getById: (id) => get().mistakes.find((m) => m.id === id),
      filtered: (filter) =>
        get().mistakes.filter((m) => (filter === 'repeated' ? m.repeatCount >= 2 : m.status === filter)),
      unresolvedCount: () => get().mistakes.filter((m) => m.status === 'unresolved').length,
    }),
    { name: 'eduway.mistakes', storage: asyncJSONStorage },
  ),
);
