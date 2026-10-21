import { tutorAnswers } from '@/data';
import type { Conversation, TutorMessage } from '@/store';
import type { Lang } from '@/types';
type TFunction = (key: string) => string;

/** The tutor store seeds one English-only demo conversation; localize it for display. */
const SEED_CONVERSATION_ID = 'c-seed-1';
const SEED_QUESTION_ID = 's1';
const SEED_ANSWER_ID = 's2';

export function localizeMessage(message: TutorMessage, lang: Lang, t: TFunction): TutorMessage {
  if (message.id === SEED_QUESTION_ID) return { ...message, text: t('tutor:seed.question') };
  if (message.id === SEED_ANSWER_ID) {
    const answer = tutorAnswers[0]?.answer;
    return answer ? { ...message, text: answer[lang] } : message;
  }
  return message;
}

export function conversationTitle(conversation: Conversation, t: TFunction): string {
  if (conversation.id === SEED_CONVERSATION_ID) return t('tutor:seed.title');
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
