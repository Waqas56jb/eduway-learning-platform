import { tutorAnswers, tutorFallback, tutorSuggestions } from '@/data';
import type { Localized, SubjectId } from '@/types';

export type TutorRole = 'student' | 'tutor';

export interface ChatMessage {
  id: string;
  role: TutorRole;
  /** The welcome message is rendered from translations so it follows the UI language. */
  kind?: 'welcome';
  content: Localized;
  at: string; // ISO
  rating?: 'up' | 'down';
}

export type Conversations = Record<SubjectId, ChatMessage[]>;

export const TUTOR_STORE_KEY = 'eduway.tutor.v1';
export const TUTOR_SUBJECT_KEY = 'eduway.tutor.subject';
export const TUTOR_SUBJECTS: SubjectId[] = ['math', 'physics', 'chemistry', 'biology', 'english'];

let counter = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const same = (s: string): Localized => ({ en: s, ar: s });
export const studentContent = same;

/**
 * Finds a canned answer for a question. Answers from the selected subject win,
 * then any subject; otherwise the generic step-by-step fallback.
 */
export function findAnswer(question: string, subject: SubjectId): Localized {
  const q = question.toLowerCase();
  const hits = tutorAnswers.filter((a) => a.keywords.some((k) => q.includes(k.toLowerCase())));
  return (hits.find((a) => a.subjectId === subject) ?? hits[0])?.answer ?? tutorFallback;
}

/** Initial conversation: a welcome message plus (optionally) one example exchange. */
export function seedConversation(subject: SubjectId, withExample = true): ChatMessage[] {
  const now = Date.now();
  const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
  const welcome: ChatMessage = { id: newId('w'), role: 'tutor', kind: 'welcome', content: same(''), at: iso(withExample ? 42 : 0) };
  if (!withExample) return [welcome];
  const question = tutorSuggestions[subject][0];
  return [
    welcome,
    { id: newId('s'), role: 'student', content: question, at: iso(41) },
    { id: newId('t'), role: 'tutor', content: findAnswer(`${question.en} ${question.ar}`, subject), at: iso(40), rating: 'up' },
  ];
}

export function seedAll(): Conversations {
  return Object.fromEntries(TUTOR_SUBJECTS.map((s) => [s, seedConversation(s)])) as Conversations;
}

/** Strips inline markdown/math markers so a half-streamed block reads cleanly as plain text. */
export const plainPreview = (s: string) => s.replace(/\*\*|\*|\$/g, '').replace(/\\[a-zA-Z]+/g, '');
