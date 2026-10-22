/**
 * Retrieval for the AI tutor (AIT-08): lesson transcripts/descriptions, question explanations and the student's own
 * lesson notes, per the `ai_settings.retrieval_*` toggles.
 *
 * pgvector is used only when `eduway_platform_embeddings` exists (it is created by migration 012 only if the
 * shared `vector` extension is enabled) AND it holds rows; this is detected at runtime and cached. Otherwise —
 * or on any vector error — a keyword search runs over lesson titles/descriptions/transcripts + question
 * explanations. Explanations of questions inside the student's live (in-progress) exam attempt are NEVER used.
 */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { TtlCache } from '../../common/utils/cache.js';
import { embeddingProvider, type RetrievedChunk } from './providers/index.js';
import { normalizeText } from './safety.js';

export interface RetrievalToggles {
  transcripts: boolean;
  explanations: boolean;
  lessonNotes: boolean;
}

const cache = new TtlCache<boolean>(5 * 60_000);

/** True when the embeddings table exists and has at least one row (cached 5 min). */
export async function vectorStoreReady(): Promise<boolean> {
  const hit = cache.get('vector');
  if (hit !== undefined) return hit;
  let ready = false;
  try {
    const exists = await db.scalar<boolean>(`SELECT to_regclass($1) IS NOT NULL`, [`public.${T.embeddings}`]);
    if (exists) ready = (await db.scalar<boolean>(`SELECT EXISTS (SELECT 1 FROM ${T.embeddings} WHERE embedding IS NOT NULL)`)) ?? false;
  } catch {
    ready = false;
  }
  cache.set('vector', ready);
  return ready;
}

export function invalidateVectorCache(): void {
  cache.clear();
}

const STOP = new Set([
  'the', 'and', 'what', 'how', 'why', 'can', 'you', 'explain', 'with', 'for', 'this', 'that', 'please', 'does', 'is', 'are', 'about',
  'ما', 'ماذا', 'كيف', 'لماذا', 'هل', 'ممكن', 'اشرح', 'شرح', 'في', 'من', 'على', 'الى', 'عن', 'هذا', 'هذه', 'مع', 'لي',
]);

/** Search terms: normalised words ≥ 3 chars, minus stop words, max 8 (longest first). */
export function searchTerms(question: string): string[] {
  const words = normalizeText(question)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 8);
}

/** Relevance = number of distinct terms contained in the text. */
export function scoreText(text: string, terms: string[]): number {
  const t = normalizeText(text);
  return terms.reduce((s, term) => s + (t.includes(term) ? 1 : 0), 0);
}

const clip = (s: string, n = 900) => (s.length > n ? `${s.slice(0, n)}…` : s);

interface LessonHit {
  id: string;
  title_en: string;
  title_ar: string;
  description_en: string;
  description_ar: string;
  transcript_en: string | null;
  transcript_ar: string | null;
}
interface QuestionHit {
  id: string;
  lesson_id: string | null;
  topic_label_en: string;
  topic_label_ar: string;
  body_en: string;
  body_ar: string;
  explanation_en: string;
  explanation_ar: string;
}

async function keywordSearch(userId: string, subjectId: string | null, question: string, lang: 'en' | 'ar', toggles: RetrievalToggles, limit: number): Promise<RetrievedChunk[]> {
  const terms = searchTerms(question);
  if (!terms.length) return [];
  const patterns = terms.map((w) => `%${w.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const out: RetrievedChunk[] = [];

  if (toggles.transcripts) {
    const lessons = await db.many<LessonHit>(
      `SELECT l.id, l.title_en, l.title_ar, l.description_en, l.description_ar, l.transcript_en, l.transcript_ar
         FROM ${T.lessons} l
        WHERE l.status = 'published' AND l.deleted_at IS NULL AND ($1::uuid IS NULL OR l.subject_id = $1)
          AND (lower(l.title_en || ' ' || l.title_ar || ' ' || l.description_en || ' ' || l.description_ar || ' ' ||
                     coalesce(l.transcript_en, '') || ' ' || coalesce(l.transcript_ar, '')) LIKE ANY($2::text[]))
        LIMIT 40`,
      [subjectId, patterns],
    );
    for (const l of lessons) {
      const transcript = lang === 'ar' ? (l.transcript_ar ?? l.transcript_en) : (l.transcript_en ?? l.transcript_ar);
      const body = transcript?.trim() ? transcript : lang === 'ar' ? l.description_ar : l.description_en;
      const title = lang === 'ar' ? l.title_ar : l.title_en;
      out.push({
        sourceType: transcript?.trim() ? 'lesson_transcript' : 'lesson_description',
        sourceId: l.id,
        lessonId: l.id,
        title,
        content: clip(body),
        score: scoreText(`${l.title_en} ${l.title_ar} ${l.description_en} ${l.description_ar} ${transcript ?? ''}`, terms),
      });
    }
  }

  if (toggles.explanations) {
    const qs = await db.many<QuestionHit>(
      `SELECT q.id, q.lesson_id, q.topic_label_en, q.topic_label_ar, q.body_en, q.body_ar, q.explanation_en, q.explanation_ar
         FROM ${T.questions} q
        WHERE q.status = 'published' AND q.deleted_at IS NULL AND ($1::uuid IS NULL OR q.subject_id = $1)
          AND (q.explanation_en <> '' OR q.explanation_ar <> '')
          AND lower(q.body_en || ' ' || q.body_ar || ' ' || q.explanation_en || ' ' || q.explanation_ar || ' ' || q.topic_label_en || ' ' || q.topic_label_ar) LIKE ANY($2::text[])
          AND NOT EXISTS (SELECT 1 FROM ${T.exam_attempts} a WHERE a.user_id = $3 AND a.status = 'in_progress' AND q.id = ANY(a.question_ids))
        LIMIT 40`,
      [subjectId, patterns, userId],
    );
    for (const q of qs) {
      const expl = lang === 'ar' ? q.explanation_ar || q.explanation_en : q.explanation_en || q.explanation_ar;
      out.push({
        sourceType: 'question_explanation',
        sourceId: q.id,
        lessonId: q.lesson_id,
        title: (lang === 'ar' ? q.topic_label_ar : q.topic_label_en) || (lang === 'ar' ? 'سؤال' : 'Question'),
        content: clip(expl),
        score: scoreText(`${q.body_en} ${q.body_ar} ${q.explanation_en} ${q.explanation_ar}`, terms) + 0.25,
      });
    }
  }

  if (toggles.lessonNotes) {
    const notes = await db.many<{ id: string; lesson_id: string; body: string; title_en: string; title_ar: string }>(
      `SELECT n.id, n.lesson_id, n.body, l.title_en, l.title_ar
         FROM ${T.lesson_notes} n JOIN ${T.lessons} l ON l.id = n.lesson_id
        WHERE n.user_id = $1 AND n.body <> '' AND ($2::uuid IS NULL OR l.subject_id = $2) AND lower(n.body) LIKE ANY($3::text[])
        LIMIT 10`,
      [userId, subjectId, patterns],
    );
    for (const n of notes) {
      out.push({ sourceType: 'lesson_notes', sourceId: n.id, lessonId: n.lesson_id, title: lang === 'ar' ? n.title_ar : n.title_en, content: clip(n.body, 500), score: scoreText(n.body, terms) });
    }
  }

  return out
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function vectorSearch(userId: string, subjectId: string | null, question: string, lang: 'en' | 'ar', toggles: RetrievalToggles, limit: number): Promise<RetrievedChunk[]> {
  const types = [toggles.transcripts ? 'lesson_transcript' : null, toggles.explanations ? 'question_explanation' : null].filter((x): x is string => !!x);
  if (!types.length) return [];
  const { provider, model } = embeddingProvider();
  if (!provider.embed) return [];
  const [vec] = await provider.embed([question], model);
  if (!vec) return [];
  const rows = await db.many<{ source_type: RetrievedChunk['sourceType']; source_id: string; lesson_id: string | null; content: string; distance: number; title_en: string | null; title_ar: string | null }>(
    `SELECT e.source_type, e.source_id, e.lesson_id, e.content, (e.embedding <=> $1::text::vector) AS distance, l.title_en, l.title_ar
       FROM ${T.embeddings} e
       LEFT JOIN ${T.lessons} l ON l.id = e.lesson_id
      WHERE e.source_type = ANY($2::text[]) AND ($3::uuid IS NULL OR e.subject_id = $3) AND e.locale = $4 AND e.embedding IS NOT NULL
        AND NOT (e.source_type = 'question_explanation' AND EXISTS (
              SELECT 1 FROM ${T.exam_attempts} a WHERE a.user_id = $5 AND a.status = 'in_progress' AND e.source_id = ANY(a.question_ids)))
      ORDER BY e.embedding <=> $1::text::vector
      LIMIT $6`,
    [`[${vec.join(',')}]`, types, subjectId, lang, userId, limit],
  );
  return rows.map((r) => ({
    sourceType: r.source_type,
    sourceId: r.source_id,
    lessonId: r.lesson_id,
    title: (lang === 'ar' ? r.title_ar : r.title_en) ?? '',
    content: r.content,
    score: 1 - Number(r.distance),
  }));
}

/** Retrieve up to `limit` context chunks. Never throws (retrieval failures degrade to no context). */
export async function retrieveContext(input: { userId: string; subjectId: string | null; question: string; lang: 'en' | 'ar'; toggles: RetrievalToggles; limit?: number }): Promise<RetrievedChunk[]> {
  const limit = input.limit ?? 4;
  try {
    if (await vectorStoreReady()) {
      const hits = await vectorSearch(input.userId, input.subjectId, input.question, input.lang, input.toggles, limit);
      if (hits.length) return hits;
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'vector retrieval failed — falling back to keyword search');
    cache.set('vector', false);
  }
  try {
    return await keywordSearch(input.userId, input.subjectId, input.question, input.lang, input.toggles, limit);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'keyword retrieval failed');
    return [];
  }
}
