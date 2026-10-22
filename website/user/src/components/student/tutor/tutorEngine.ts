import type { Localized, TutorMessage } from '@/api/types';

export type TutorRole = 'student' | 'tutor';

/** UI shape of a chat message (mapped from the API's TutorMessage). */
export interface ChatMessage {
  id: string;
  role: TutorRole;
  /** The welcome message is rendered from translations so it follows the UI language. */
  kind?: 'welcome';
  content: Localized;
  at: string; // ISO
  rating?: 'up' | 'down';
  imageUrl?: string | null;
  status?: TutorMessage['status'];
}

/** Last subject the student chatted about (per-browser convenience only). */
export const TUTOR_SUBJECT_KEY = 'eduway.tutor.subject';

let counter = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const same = (s: string): Localized => ({ en: s, ar: s });
export const studentContent = same;

/** API message → chat bubble. Answers are in the language of the request, so both slots carry the text. */
export function toChatMessage(m: TutorMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    kind: m.kind === 'welcome' ? 'welcome' : undefined,
    content: m.content?.en || m.content?.ar ? m.content : same(m.text),
    at: m.at || m.date,
    rating: m.rating ?? undefined,
    imageUrl: m.imageUrl,
    status: m.status,
  };
}

/** Strips inline markdown/math markers so a half-streamed block reads cleanly as plain text. */
export const plainPreview = (s: string) => s.replace(/\*\*|\*|\$/g, '').replace(/\[a-zA-Z]+/g, '');
