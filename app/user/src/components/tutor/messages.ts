import type { ConversationSummary, TutorMessageDto } from '@/api/types';
import type { Lang } from '@/types';

type TFunction = (key: string) => string;

/** A chat bubble. Server messages keep their id; optimistic/streaming ones use a `tmp-` id. */
export interface TutorMessage {
  id: string;
  role: 'student' | 'tutor';
  /** Markdown-lite text; may contain $inline$ and $$block$$ LaTeX. */
  text: string;
  /** Attached image (signed URL or local preview). */
  imageUri?: string;
  date: string; // ISO
  rating?: 'up' | 'down' | null;
  /** True while the answer is still streaming in. */
  streaming?: boolean;
}

export const isServerMessage = (m: TutorMessage) => !m.id.startsWith('tmp-');

export const fromDto = (m: TutorMessageDto): TutorMessage => ({
  id: m.id,
  role: m.role,
  text: m.text,
  imageUri: m.imageUrl ?? undefined,
  date: m.date ?? m.at,
  rating: m.rating,
});

export function conversationTitle(conversation: Pick<ConversationSummary, 'title'>, t: TFunction): string {
  return conversation.title.trim() || t('tutor:history.untitled');
}

/** Short HH:MM timestamp for a bubble. */
export function messageTime(iso: string, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-IQ' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(11, 16);
  }
}
