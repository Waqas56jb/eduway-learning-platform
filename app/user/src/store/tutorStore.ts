import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { tutorAnswers, tutorFallback } from '@/data';
import type { Lang, Localized, SubjectId } from '@/types';
import { asyncJSONStorage } from './storage';
import { useAuthStore } from './authStore';

export interface TutorMessage {
  id: string;
  role: 'student' | 'tutor';
  /** Markdown-lite text; may contain $inline$ and $$block$$ LaTeX. */
  text: string;
  /** Optional attached image URI (mock attach). */
  imageUri?: string;
  date: string; // ISO
}

export interface Conversation {
  id: string;
  subjectId: SubjectId;
  title: string;
  messages: TutorMessage[];
  updatedAt: string; // ISO
}

export type SendResult = 'ok' | 'limit';

interface TutorState {
  conversations: Conversation[];
  activeId: string | null;
  /** True while the mock tutor is "typing". */
  typing: boolean;
  newConversation: (subjectId: SubjectId) => string;
  setActive: (id: string | null) => void;
  setSubject: (subjectId: SubjectId) => void;
  /** Sends a student message and resolves after the canned tutor reply arrives. */
  send: (text: string, lang: Lang, imageUri?: string) => Promise<SendResult>;
  deleteConversation: (id: string) => void;
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function pickAnswer(text: string, subjectId: SubjectId): Localized {
  const q = text.toLowerCase();
  const hit = tutorAnswers.find((a) => a.keywords.some((k) => q.includes(k.toLowerCase())));
  if (hit) return hit.answer;
  // Unknown question: answer with the first canned topic for the chosen subject only if the
  // student sent a very short prompt (e.g. "help"), otherwise use the generic method answer.
  if (q.trim().split(/\s+/).length <= 2) {
    return tutorAnswers.find((a) => a.subjectId === subjectId)?.answer ?? tutorFallback;
  }
  return tutorFallback;
}

const seedConversations: Conversation[] = [
  {
    id: 'c-seed-1',
    subjectId: 'physics',
    title: "Faraday's law",
    updatedAt: '2026-10-21T16:02:00Z',
    messages: [
      { id: 's1', role: 'student', text: "Explain Faraday's law of induction", date: '2026-10-21T16:01:00Z' },
      { id: 's2', role: 'tutor', text: tutorAnswers[0]!.answer.en, date: '2026-10-21T16:02:00Z' },
    ],
  },
];

export const useTutorStore = create<TutorState>()(
  persist(
    (set, get) => ({
      conversations: seedConversations,
      activeId: null,
      typing: false,
      newConversation: (subjectId) => {
        const id = `c-${uid()}`;
        set((s) => ({
          conversations: [{ id, subjectId, title: '', messages: [], updatedAt: new Date().toISOString() }, ...s.conversations],
          activeId: id,
        }));
        return id;
      },
      setActive: (activeId) => set({ activeId }),
      setSubject: (subjectId) =>
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === s.activeId ? { ...c, subjectId } : c)),
        })),
      send: async (text, lang, imageUri) => {
        if (!useAuthStore.getState().consumeAi()) return 'limit';
        let id = get().activeId;
        if (!id) id = get().newConversation('math');
        const now = new Date().toISOString();
        const studentMsg: TutorMessage = { id: uid(), role: 'student', text, imageUri, date: now };
        set((s) => ({
          typing: true,
          conversations: s.conversations.map((c) =>
            c.id === id
              ? { ...c, title: c.title || text.slice(0, 48), messages: [...c.messages, studentMsg], updatedAt: now }
              : c,
          ),
        }));
        await new Promise((r) => setTimeout(r, 1400));
        const conv = get().conversations.find((c) => c.id === id);
        const answer = pickAnswer(text, conv?.subjectId ?? 'math');
        const reply: TutorMessage = { id: uid(), role: 'tutor', text: answer[lang], date: new Date().toISOString() };
        set((s) => ({
          typing: false,
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, messages: [...c.messages, reply], updatedAt: reply.date } : c,
          ),
        }));
        return 'ok';
      },
      deleteConversation: (id) =>
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
        })),
    }),
    {
      name: 'eduway.tutor',
      storage: asyncJSONStorage,
      partialize: (s) => ({ conversations: s.conversations, activeId: s.activeId }),
    },
  ),
);
