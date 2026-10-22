/**
 * Retrieval for the AI tutor (AIT-08): the knowledge base (lessons, units, chapters, question explanations, FAQs —
 * see knowledge-base.ts) and the student's own lesson notes, per the `ai_settings.retrieval_*` toggles.
 *
 * Vector path (fast): the question embedding is cached (LRU, 1 h), then ONE SQL statement does top-k cosine search
 * (HNSW) restricted to the conversation subject + subjects the student is currently entitled to (FAQs are global),
 * excludes questions of a live exam attempt, re-ranks with a boost for the current lesson and keeps ≤ 2 chunks per
 * source.
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
import { sha256 } from '../../common/utils/crypto.js';
import { vectorSql } from './knowledge-base.js';
import { embeddingProvider, type RetrievedChunk } from './providers/index.js';
import { normalizeText } from './safety.js';
import { likeContains } from '../../common/utils/like.js';

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
  const patterns = terms.map((w) => likeContains(w));
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

/** Question embeddings (same question asked again / by many students → no extra embedding call). */
const questionVectors = new TtlCache<number[]>(60 * 60_000, 2000);

export async function embedQuestion(question: string): Promise<number[] | null> {
  const { provider, model } = embeddingProvider();
  if (!provider.embed) return null;
  const key = sha256(`${model}|${normalizeText(question).replace(/\s+/g, ' ').trim()}`);
  const hit = questionVectors.get(key);
  if (hit) return hit;
  const { vectors } = await provider.embed([question], model);
  const vec = vectors[0];
  if (vec) questionVectors.set(key, vec);
  return vec ?? null;
}

/**
 * Minimum cosine similarity for a chunk to be used (text-embedding-3-small; unrelated Arabic/English pairs score
 * ≈ 0.15–0.3), plus a relative cut: chunks far below the best hit are noise. The offline mock uses 0.
 */
const MIN_SIMILARITY = 0.25;
const RELATIVE_CUT = 0.12;
const LESSON_BOOST = 0.08;

async function vectorSearch(input: { userId: string; subjectId: string | null; lessonId: string | null; question: string; lang: 'en' | 'ar'; toggles: RetrievalToggles; limit: number }): Promise<RetrievedChunk[]> {
  const types = [
    ...(input.toggles.transcripts ? ['lesson', 'unit', 'topic'] : []),
    ...(input.toggles.explanations ? ['question_explanation'] : []),
    'faq',
  ];
  const vec = await vectorSql();
  if (!vec) return [];
  const qv = await embedQuestion(input.question);
  if (!qv) return [];
  const minSim = embeddingProvider().real ? MIN_SIMILARITY : 0;
  const rows = await db.many<{ source_type: RetrievedChunk['sourceType']; source_id: string; subject_id: string | null; lesson_id: string | null; title: string; content: string; similarity: number; score: number }>(
    `WITH q AS (SELECT $1::text::${vec.type} AS v),
     cand AS (
       SELECT e.source_type, e.source_id, e.subject_id, e.lesson_id, e.title, e.content, e.chunk_index,
              1 - (e.embedding ${vec.cosine} q.v) AS similarity
         FROM ${T.embeddings} e, q
        WHERE e.locale = $2 AND e.source_type = ANY($3::text[]) AND e.embedding IS NOT NULL
          AND (e.subject_id IS NULL OR (
                ($4::uuid IS NULL OR e.subject_id = $4)
                AND EXISTS (SELECT 1 FROM ${T.entitlements} en WHERE en.user_id = $5 AND en.subject_id = e.subject_id
                               AND en.revoked_at IS NULL AND en.starts_at <= now() AND en.ends_at > now())))
          AND NOT (e.source_type = 'question_explanation' AND EXISTS (
                SELECT 1 FROM ${T.exam_attempts} a WHERE a.user_id = $5 AND a.status = 'in_progress' AND e.source_id = ANY(a.question_ids)))
        ORDER BY e.embedding ${vec.cosine} q.v
        LIMIT $6
     ),
     ranked AS (
       SELECT c.*, c.similarity + CASE WHEN $7::uuid IS NOT NULL AND c.lesson_id = $7 THEN ${LESSON_BOOST} ELSE 0 END AS score,
              row_number() OVER (PARTITION BY c.source_type, c.source_id ORDER BY c.similarity DESC) AS rn
         FROM cand c WHERE c.similarity >= $8
     )
     SELECT source_type, source_id, subject_id, lesson_id, title, content, similarity, score
       FROM ranked WHERE rn <= 2 ORDER BY score DESC LIMIT $9`,
    [`[${qv.join(',')}]`, input.lang, types, input.subjectId, input.userId, input.limit * 5, input.lessonId, minSim, input.limit],
  );
  const best = rows.length ? Number(rows[0]?.score) : 0;
  return rows.filter((r) => minSim === 0 || Number(r.score) >= best - RELATIVE_CUT).map((r) => ({
    sourceType: r.source_type,
    sourceId: r.source_id,
    lessonId: r.lesson_id,
    subjectId: r.subject_id,
    title: r.title,
    content: r.content,
    score: Number(r.score),
  }));
}

/** Retrieve up to `limit` context chunks. Never throws (retrieval failures degrade to no context). */
export async function retrieveContext(input: { userId: string; subjectId: string | null; lessonId?: string | null; question: string; lang: 'en' | 'ar'; toggles: RetrievalToggles; limit?: number }): Promise<RetrievedChunk[]> {
  const limit = input.limit ?? 5;
  let notes: RetrievedChunk[] = [];
  try {
    if (await vectorStoreReady()) {
      const [hits, own] = await Promise.all([
        vectorSearch({ ...input, lessonId: input.lessonId ?? null, limit }),
        input.toggles.lessonNotes ? keywordSearch(input.userId, input.subjectId, input.question, input.lang, { transcripts: false, explanations: false, lessonNotes: true }, 2).catch(() => []) : Promise.resolve([]),
      ]);
      notes = own;
      // The vector index answered: no relevant hit means "no context", not "try keywords" (keyword matches on
      // generic words like "law"/"قانون" would inject unrelated lessons).
      return [...hits, ...notes];
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'vector retrieval failed — falling back to keyword search');
    cache.set('vector', false, 60_000);
  }
  try {
    return await keywordSearch(input.userId, input.subjectId, input.question, input.lang, input.toggles, limit);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'keyword retrieval failed');
    return notes;
  }
}
