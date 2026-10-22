/** Row → DTO mappers for the AI tutor (API_CONTRACT §12). */
import { logger } from '../../config/logger.js';
import { storage } from '../../common/services/storage.js';
import type { ConversationRow, MessageRow } from './repository.js';

export interface TutorMessage {
  id: string;
  conversationId: string;
  role: 'student' | 'tutor';
  kind: 'message' | 'welcome';
  text: string;
  content: { en: string; ar: string };
  imageUrl: string | null;
  status: MessageRow['status'];
  rating: 'up' | 'down' | null;
  date: string;
  at: string;
  /** Knowledge-base sources the answer was grounded on (tutor messages; [] otherwise). */
  citations: TutorCitation[];
}

export interface TutorCitation {
  type: string;
  id: string;
  lessonId: string | null;
  subjectId: string | null;
  title: string;
}

/** Stored `ai_messages.citations` JSON → DTO (tolerates rows written before subjectId existed). */
export function toCitations(raw: unknown): TutorCitation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string')
    .map((c) => ({
      type: String(c.type ?? ''),
      id: String(c.id),
      lessonId: typeof c.lessonId === 'string' ? c.lessonId : null,
      subjectId: typeof c.subjectId === 'string' ? c.subjectId : null,
      title: String(c.title ?? ''),
    }));
}

export interface ConversationSummary {
  id: string;
  subjectId: string;
  subjectSlug: string;
  title: string;
  lastMessagePreview: string;
  messageCount: number;
  updatedAt: string;
  createdAt: string;
}

export function welcomeText(subjectName: { en: string; ar: string } | null): { en: string; ar: string } {
  const en = subjectName?.en ?? 'your subjects';
  const ar = subjectName?.ar ?? 'موادك';
  return {
    en: `Hi! I'm your EDUWAY tutor for ${en}. Ask me anything from your lessons — I'll explain step by step.`,
    ar: `أهلاً! أنا معلّمك الذكي في إيدوواي لمادة ${ar}. اسألني أي شيء من دروسك وسأشرحه لك خطوة بخطوة.`,
  };
}

async function attachmentUrl(fileKey: string | null): Promise<string | null> {
  if (!fileKey) return null;
  try {
    const up = await storage.getUpload(fileKey);
    return (await storage.signedUrl(up.bucket, up.path)).url;
  } catch (err) {
    logger.debug({ err: (err as Error).message }, 'attachment url unavailable');
    return null;
  }
}

export async function toTutorMessage(m: MessageRow, locale: 'en' | 'ar', conv?: Pick<ConversationRow, 'subject_name_en' | 'subject_name_ar'> | null, liveText?: string): Promise<TutorMessage> {
  const at = m.created_at.toISOString();
  if (m.role === 'system') {
    const w = welcomeText(conv?.subject_name_en ? { en: conv.subject_name_en, ar: conv.subject_name_ar ?? conv.subject_name_en } : null);
    return { id: m.id, conversationId: m.conversation_id, role: 'tutor', kind: 'welcome', text: w[locale], content: w, imageUrl: null, status: 'complete', rating: null, date: at, at, citations: [] };
  }
  const text = liveText ?? m.content;
  return {
    id: m.id,
    conversationId: m.conversation_id,
    role: m.role === 'user' ? 'student' : 'tutor',
    kind: 'message',
    text,
    content: { en: text, ar: text },
    imageUrl: await attachmentUrl(m.attachment_file_key),
    status: m.status,
    rating: m.feedback,
    date: at,
    at,
    citations: m.role === 'assistant' ? toCitations(m.citations) : [],
  };
}

export function toSummary(c: ConversationRow): ConversationSummary {
  const preview = c.preview === 'welcome' ? '' : (c.preview ?? '');
  return {
    id: c.id,
    subjectId: c.subject_id ?? '',
    subjectSlug: c.subject_slug ?? '',
    title: c.title,
    lastMessagePreview: preview.replace(/\s+/g, ' ').slice(0, 140),
    messageCount: c.message_count,
    updatedAt: (c.last_message_at ?? c.updated_at).toISOString(),
    createdAt: c.created_at.toISOString(),
  };
}
