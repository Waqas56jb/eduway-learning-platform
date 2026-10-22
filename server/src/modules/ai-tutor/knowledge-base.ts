/**
 * AI-tutor knowledge base (RAG index) — `eduway_platform_embeddings` (pgvector, migration 012) + run log
 * `eduway_platform_kb_index_runs` (migration 405).
 *
 * Sources (published / active only), one document per source per locale, chunked (~1000 chars, each chunk carries a
 * title header so it stands alone):
 *   lesson               title + subject/unit/chapter + description + transcript
 *   unit / topic         structure overview (title, subject, chapters, lesson titles)
 *   question_explanation question body + correct option + explanation
 *   faq                  CMS FAQ question + answer (subject-less → visible to every student)
 * A locale with no text of its own falls back to the other locale's text, so Arabic questions still find
 * English-only transcripts.
 *
 * Sync is incremental: each chunk's hash = sha256(model, title, content); unchanged chunks are skipped, changed ones
 * re-embedded in batches (one OpenAI call per ≤ 96 chunks, single-statement upserts), and rows of unpublished /
 * deleted sources (or surplus chunk indexes) are removed. Runs are serialized in-process.
 *
 * Triggers: admin "Reindex" (ADM-AI-16/17), admin content mutations (debounced, scoped — see `queueContentSync`),
 * the nightly `eduway.embeddings-generate` cron, and `npm run kb:index`. Runs execute in the `eduway.kb-index` job.
 */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { onAdminMutation } from '../../common/middleware/audit.js';
import { sha256 } from '../../common/utils/crypto.js';
import { embeddingProvider, type KnowledgeSourceType } from './providers/index.js';

export const KB_SOURCE_TYPES: KnowledgeSourceType[] = ['lesson', 'unit', 'topic', 'question_explanation', 'faq'];

type Locale = 'en' | 'ar';

export interface KbScope {
  /** Types to sync completely (every source of the type, removing stale rows). */
  types?: KnowledgeSourceType[];
  /** Individual sources to sync (removed from the index when no longer published). */
  ids?: Partial<Record<KnowledgeSourceType, string[]>>;
}

export interface KbDoc {
  sourceType: KnowledgeSourceType;
  sourceId: string;
  subjectId: string | null;
  unitId: string | null;
  lessonId: string | null;
  locale: Locale;
  title: string;
  body: string;
}

export interface KbChunk {
  doc: KbDoc;
  index: number;
  content: string;
  hash: string;
}

export interface KbSyncResult {
  skipped: string | null;
  sources: number;
  chunks: number;
  embedded: number;
  unchanged: number;
  deleted: number;
  tokens: number;
  costUsd: number;
  model: string;
}

const EMBED_BATCH = 96;
const CHUNK_CHARS = 1000;

// ── pure helpers (unit-tested) ──────────────────────────────────────────────────────────────────────

/** Split long text into ≤ `max`-char chunks on paragraph / sentence boundaries (Arabic `؟` included). */
export function chunkText(text: string, max = CHUNK_CHARS): string[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  if (!clean) return [];
  const parts = clean.split(/\n{2,}|(?<=[.!?؟۔])\s+/);
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + ' ' + p).trim().length > max && cur) {
      out.push(cur.trim());
      cur = p;
    } else cur = `${cur} ${p}`;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((c) => (c.length > max * 1.5 ? (c.match(new RegExp(`[\\s\\S]{1,${max}}`, 'g')) ?? []) : [c]));
}

/** Chunks of a document; every chunk starts with the title line so it is self-describing. */
export function chunkDoc(doc: KbDoc, model: string, max = CHUNK_CHARS): KbChunk[] {
  const header = doc.title.trim();
  const pieces = chunkText(doc.body, max);
  const contents = pieces.length ? pieces.map((p) => (header ? `${header}\n${p}` : p)) : header ? [header] : [];
  return contents.map((content, index) => ({ doc, index, content, hash: sha256(`${model}\n${doc.title}\n${content}`) }));
}

/** Merge two scopes (debounced content triggers). `undefined` = full index. */
export function mergeScopes(a: KbScope | undefined, b: KbScope | undefined): KbScope | undefined {
  if (!a || !b) return undefined;
  const types = [...new Set([...(a.types ?? []), ...(b.types ?? [])])];
  const ids: Partial<Record<KnowledgeSourceType, string[]>> = {};
  for (const t of KB_SOURCE_TYPES) {
    if (types.includes(t)) continue;
    const v = [...new Set([...(a.ids?.[t] ?? []), ...(b.ids?.[t] ?? [])])];
    if (v.length) ids[t] = v;
  }
  return { types, ids };
}

/**
 * Which part of the knowledge base an admin mutation can affect. `entity`/`entityId` come from the audit
 * descriptor when the route has one; otherwise the URL path decides. Returns null for unrelated mutations.
 */
export function kbScopeForMutation(path: string, entity: string | null | undefined, entityId: string | null | undefined): KbScope | null {
  const p = path.toLowerCase();
  const ent = (entity ?? '').toLowerCase();
  const pathId = /\/admin\/(?:lessons|questions)\/([0-9a-f-]{36})(?:\/|$)/.exec(p)?.[1] ?? null;
  const id = entityId && /^[0-9a-f-]{36}$/i.test(entityId) && (ent === 'lesson' || ent === 'question' || entityId.toLowerCase() === pathId) ? entityId : null;
  if (ent === 'lesson' || (!ent && /\/admin\/lessons(\/|$)/.test(p))) return id ? { ids: { lesson: [id] } } : { types: ['lesson', 'unit', 'topic'] };
  if (ent === 'question' || ent === 'question_import' || (!ent && /\/admin\/questions(\/|$)/.test(p))) return id ? { ids: { question_explanation: [id] } } : { types: ['question_explanation'] };
  // Structure renames change the headers of every lesson below them → re-hash those types (unchanged chunks are free).
  if (['unit', 'topic', 'subject'].includes(ent) || /\/admin\/(subjects|units|topics)(\/|$)/.test(p)) return { types: ['lesson', 'unit', 'topic', 'question_explanation'] };
  if (ent === 'cms_faq' || /\/admin\/(cms|settings)\/.*faq/.test(p) || /\/admin\/faq/.test(p)) return { types: ['faq'] };
  return null;
}

// ── pgvector type resolution (the extension lives in a shared schema, e.g. `extensions`) ─────────────

let vecSchema: string | null | undefined;

/** `"<schema>".vector` + its `<=>` operator, or null when pgvector / the embeddings table is unavailable. */
export async function vectorSql(): Promise<{ type: string; cosine: string } | null> {
  if (vecSchema === undefined) {
    try {
      const r = await db.maybeOne<{ schema: string; table_ok: boolean }>(
        `SELECT n.nspname AS schema, to_regclass($1) IS NOT NULL AS table_ok
           FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'vector'`,
        [`public.${T.embeddings}`],
      );
      vecSchema = r?.table_ok ? r.schema : null;
    } catch {
      vecSchema = null;
    }
    if (vecSchema === null) setTimeout(() => (vecSchema = undefined), 60_000).unref();
  }
  if (!vecSchema) return null;
  const q = `"${vecSchema.replace(/"/g, '""')}"`;
  return { type: `${q}.vector`, cosine: `OPERATOR(${q}.<=>)` };
}

export function resetVectorSqlCache(): void {
  vecSchema = undefined;
}

// ── loaders ───────────────────────────────────────────────────────────────────────────────────────

const pick = (lc: Locale, en: string | null | undefined, ar: string | null | undefined): string => {
  const a = (lc === 'en' ? en : ar)?.trim() ?? '';
  return a || ((lc === 'en' ? ar : en)?.trim() ?? '');
};
const LABEL = {
  en: { subject: 'Subject', unit: 'Unit', chapter: 'Chapter', lessons: 'Lessons', chapters: 'Chapters', question: 'Question', answer: 'Correct answer', explanation: 'Explanation', faq: 'FAQ' },
  ar: { subject: 'المادة', unit: 'الوحدة', chapter: 'الفصل', lessons: 'الدروس', chapters: 'الفصول', question: 'السؤال', answer: 'الإجابة الصحيحة', explanation: 'الشرح', faq: 'سؤال شائع' },
};
const LOCALES: Locale[] = ['en', 'ar'];

async function loadLessons(ids: string[] | null): Promise<KbDoc[]> {
  const rows = await db.many<Record<string, string | null>>(
    `SELECT l.id, l.subject_id, l.unit_id, l.title_en, l.title_ar, l.description_en, l.description_ar, l.transcript_en, l.transcript_ar,
            s.name_en AS s_en, s.name_ar AS s_ar, u.title_en AS u_en, u.title_ar AS u_ar, tp.title_en AS t_en, tp.title_ar AS t_ar
       FROM ${T.lessons} l
       JOIN ${T.subjects} s ON s.id = l.subject_id AND s.deleted_at IS NULL
       LEFT JOIN ${T.units} u ON u.id = l.unit_id
       LEFT JOIN ${T.topics} tp ON tp.id = l.topic_id
      WHERE l.status = 'published' AND l.deleted_at IS NULL AND ($1::uuid[] IS NULL OR l.id = ANY($1::uuid[]))`,
    [ids],
  );
  return rows.flatMap((r) =>
    LOCALES.map((lc) => {
      const L = LABEL[lc];
      const path = [`${L.subject}: ${pick(lc, r.s_en, r.s_ar)}`, r.u_en || r.u_ar ? `${L.unit}: ${pick(lc, r.u_en, r.u_ar)}` : '', r.t_en || r.t_ar ? `${L.chapter}: ${pick(lc, r.t_en, r.t_ar)}` : '']
        .filter(Boolean)
        .join(' · ');
      const body = [path, pick(lc, r.description_en, r.description_ar), pick(lc, r.transcript_en, r.transcript_ar)].filter(Boolean).join('\n\n');
      return { sourceType: 'lesson' as const, sourceId: r.id!, subjectId: r.subject_id ?? null, unitId: r.unit_id ?? null, lessonId: r.id!, locale: lc, title: pick(lc, r.title_en, r.title_ar), body };
    }),
  );
}

async function loadUnits(ids: string[] | null): Promise<KbDoc[]> {
  const rows = await db.many<{ id: string; subject_id: string; title_en: string; title_ar: string; s_en: string; s_ar: string; topics: { en: string; ar: string }[] | null; lessons: { en: string; ar: string }[] | null }>(
    `SELECT u.id, u.subject_id, u.title_en, u.title_ar, s.name_en AS s_en, s.name_ar AS s_ar,
            (SELECT json_agg(json_build_object('en', t.title_en, 'ar', t.title_ar) ORDER BY t.sort_order) FROM ${T.topics} t
              WHERE t.unit_id = u.id AND t.deleted_at IS NULL AND t.status = 'published') AS topics,
            (SELECT json_agg(json_build_object('en', l.title_en, 'ar', l.title_ar) ORDER BY l.sort_order) FROM ${T.lessons} l
              WHERE l.unit_id = u.id AND l.deleted_at IS NULL AND l.status = 'published') AS lessons
       FROM ${T.units} u JOIN ${T.subjects} s ON s.id = u.subject_id AND s.deleted_at IS NULL
      WHERE u.status = 'published' AND u.deleted_at IS NULL AND ($1::uuid[] IS NULL OR u.id = ANY($1::uuid[]))`,
    [ids],
  );
  return rows.flatMap((r) =>
    LOCALES.map((lc) => {
      const L = LABEL[lc];
      const list = (xs: { en: string; ar: string }[] | null) => (xs ?? []).map((x) => pick(lc, x.en, x.ar)).join(lc === 'ar' ? '، ' : ', ');
      const body = [`${L.subject}: ${pick(lc, r.s_en, r.s_ar)}`, r.topics?.length ? `${L.chapters}: ${list(r.topics)}` : '', r.lessons?.length ? `${L.lessons}: ${list(r.lessons)}` : ''].filter(Boolean).join('\n');
      return { sourceType: 'unit' as const, sourceId: r.id, subjectId: r.subject_id, unitId: r.id, lessonId: null, locale: lc, title: `${L.unit}: ${pick(lc, r.title_en, r.title_ar)}`, body };
    }),
  );
}

async function loadTopics(ids: string[] | null): Promise<KbDoc[]> {
  const rows = await db.many<{ id: string; unit_id: string; subject_id: string; title_en: string; title_ar: string; u_en: string; u_ar: string; s_en: string; s_ar: string; lessons: { en: string; ar: string }[] | null }>(
    `SELECT t.id, t.unit_id, u.subject_id, t.title_en, t.title_ar, u.title_en AS u_en, u.title_ar AS u_ar, s.name_en AS s_en, s.name_ar AS s_ar,
            (SELECT json_agg(json_build_object('en', l.title_en, 'ar', l.title_ar) ORDER BY l.sort_order) FROM ${T.lessons} l
              WHERE l.topic_id = t.id AND l.deleted_at IS NULL AND l.status = 'published') AS lessons
       FROM ${T.topics} t
       JOIN ${T.units} u ON u.id = t.unit_id AND u.deleted_at IS NULL
       JOIN ${T.subjects} s ON s.id = u.subject_id AND s.deleted_at IS NULL
      WHERE t.status = 'published' AND t.deleted_at IS NULL AND ($1::uuid[] IS NULL OR t.id = ANY($1::uuid[]))`,
    [ids],
  );
  return rows.flatMap((r) =>
    LOCALES.map((lc) => {
      const L = LABEL[lc];
      const sep = lc === 'ar' ? '، ' : ', ';
      const body = [`${L.subject}: ${pick(lc, r.s_en, r.s_ar)} · ${L.unit}: ${pick(lc, r.u_en, r.u_ar)}`, r.lessons?.length ? `${L.lessons}: ${r.lessons.map((x) => pick(lc, x.en, x.ar)).join(sep)}` : '']
        .filter(Boolean)
        .join('\n');
      return { sourceType: 'topic' as const, sourceId: r.id, subjectId: r.subject_id, unitId: r.unit_id, lessonId: null, locale: lc, title: `${L.chapter}: ${pick(lc, r.title_en, r.title_ar)}`, body };
    }),
  );
}

async function loadQuestions(ids: string[] | null): Promise<KbDoc[]> {
  const rows = await db.many<Record<string, string | null>>(
    `SELECT q.id, q.subject_id, q.unit_id, q.lesson_id, q.topic_label_en, q.topic_label_ar, q.body_en, q.body_ar, q.formula,
            q.explanation_en, q.explanation_ar, l.title_en AS l_en, l.title_ar AS l_ar,
            (SELECT o.text_en FROM ${T.question_options} o WHERE o.question_id = q.id AND o.is_correct ORDER BY o.sort_order LIMIT 1) AS ans_en,
            (SELECT o.text_ar FROM ${T.question_options} o WHERE o.question_id = q.id AND o.is_correct ORDER BY o.sort_order LIMIT 1) AS ans_ar
       FROM ${T.questions} q
       JOIN ${T.subjects} s ON s.id = q.subject_id AND s.deleted_at IS NULL
       LEFT JOIN ${T.lessons} l ON l.id = q.lesson_id
      WHERE q.status = 'published' AND q.deleted_at IS NULL AND (q.explanation_en <> '' OR q.explanation_ar <> '')
        AND ($1::uuid[] IS NULL OR q.id = ANY($1::uuid[]))`,
    [ids],
  );
  return rows.flatMap((r) =>
    LOCALES.map((lc) => {
      const L = LABEL[lc];
      const ans = pick(lc, r.ans_en, r.ans_ar);
      const body = [`${L.question}: ${pick(lc, r.body_en, r.body_ar)}${r.formula ? ` ${r.formula}` : ''}`, ans ? `${L.answer}: ${ans}` : '', `${L.explanation}: ${pick(lc, r.explanation_en, r.explanation_ar)}`]
        .filter(Boolean)
        .join('\n');
      const title = pick(lc, r.l_en, r.l_ar) || pick(lc, r.topic_label_en, r.topic_label_ar) || L.question;
      return { sourceType: 'question_explanation' as const, sourceId: r.id!, subjectId: r.subject_id ?? null, unitId: r.unit_id ?? null, lessonId: r.lesson_id ?? null, locale: lc, title, body };
    }),
  );
}

async function loadFaqs(ids: string[] | null): Promise<KbDoc[]> {
  const rows = await db.many<{ id: string; question_en: string; question_ar: string; answer_en: string; answer_ar: string }>(
    `SELECT id, question_en, question_ar, answer_en, answer_ar FROM ${T.cms_faq} WHERE active AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))`,
    [ids],
  );
  return rows.flatMap((r) =>
    LOCALES.map((lc) => ({
      sourceType: 'faq' as const,
      sourceId: r.id,
      subjectId: null,
      unitId: null,
      lessonId: null,
      locale: lc,
      title: `${LABEL[lc].faq}: ${pick(lc, r.question_en, r.question_ar)}`,
      body: pick(lc, r.answer_en, r.answer_ar),
    })),
  );
}

const LOADERS: Record<KnowledgeSourceType, (ids: string[] | null) => Promise<KbDoc[]>> = {
  lesson: loadLessons,
  unit: loadUnits,
  topic: loadTopics,
  question_explanation: loadQuestions,
  faq: loadFaqs,
};

/** Per type: null = all sources of the type; string[] = only these ids; type absent = not part of this sync. */
async function resolveScope(scope: KbScope | undefined): Promise<Map<KnowledgeSourceType, string[] | null>> {
  const out = new Map<KnowledgeSourceType, string[] | null>();
  if (!scope || (!scope.types?.length && !Object.values(scope.ids ?? {}).some((v) => v?.length))) {
    for (const t of KB_SOURCE_TYPES) out.set(t, null);
    return out;
  }
  for (const t of scope.types ?? []) out.set(t, null);
  for (const t of KB_SOURCE_TYPES) {
    const ids = scope.ids?.[t];
    if (ids?.length && !out.has(t)) out.set(t, [...ids]);
  }
  // A lesson change also changes the overview of its unit and chapter (lesson titles are listed there).
  const lessonIds = out.get('lesson');
  if (lessonIds?.length) {
    const parents = await db.many<{ unit_id: string | null; topic_id: string | null }>(`SELECT unit_id, topic_id FROM ${T.lessons} WHERE id = ANY($1::uuid[])`, [lessonIds]);
    for (const [type, key] of [['unit', 'unit_id'], ['topic', 'topic_id']] as const) {
      if (out.get(type) === null) continue;
      const extra = parents.map((p) => p[key]).filter((x): x is string => !!x);
      if (extra.length) out.set(type, [...new Set([...(out.get(type) ?? []), ...extra])]);
    }
  }
  return out;
}

// ── sync ──────────────────────────────────────────────────────────────────────────────────────────

let chain: Promise<unknown> = Promise.resolve();

/** Serialize syncs in this process (two concurrent runs would embed the same chunks twice). */
function serialized<R>(fn: () => Promise<R>): Promise<R> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

export interface SyncOptions {
  force?: boolean;
  onProgress?: (p: { chunks: number; embedded: number; unchanged: number; deleted: number; tokens: number; sources: number }) => Promise<void> | void;
}

export function syncKnowledgeBase(scope?: KbScope, opts: SyncOptions = {}): Promise<KbSyncResult> {
  return serialized(() => doSync(scope, opts));
}

async function doSync(scope: KbScope | undefined, opts: SyncOptions): Promise<KbSyncResult> {
  const { provider, model, real } = embeddingProvider();
  const empty = (skipped: string): KbSyncResult => ({ skipped, sources: 0, chunks: 0, embedded: 0, unchanged: 0, deleted: 0, tokens: 0, costUsd: 0, model });
  const vec = await vectorSql();
  if (!vec) return empty('vector extension / embeddings table not available');
  if (!provider.embed) return empty('no embedding provider');

  const plan = await resolveScope(scope);
  const docs = (await Promise.all([...plan.entries()].map(([type, ids]) => LOADERS[type](ids)))).flat();
  const chunks = docs.flatMap((d) => chunkDoc(d, model));
  const sources = new Set(docs.map((d) => `${d.sourceType}:${d.sourceId}`)).size;

  // Existing rows of the scope (one query): full types + explicit ids.
  const fullTypes: string[] = [...plan.entries()].filter(([, ids]) => ids === null).map(([t]) => t);
  // A full lesson sync also clears rows of the legacy pre-RAG type (`lesson_transcript`), which nothing produces now.
  if (fullTypes.includes('lesson')) fullTypes.push('lesson_transcript');
  const idTypes: string[] = [];
  const idVals: string[] = [];
  for (const [t, ids] of plan.entries()) {
    for (const id of ids ?? []) {
      idTypes.push(t);
      idVals.push(id);
    }
  }
  const existing = await db.many<{ id: string; source_type: string; source_id: string; locale: string; chunk_index: number; content_hash: string }>(
    `SELECT e.id, e.source_type, e.source_id, e.locale, e.chunk_index, e.content_hash FROM ${T.embeddings} e
      WHERE e.source_type = ANY($1::text[])
         OR (e.source_type, e.source_id) IN (SELECT * FROM unnest($2::text[], $3::uuid[]))`,
    [fullTypes, idTypes, idVals],
  );
  const key = (t: string, id: string, lc: string, i: number) => `${t}|${id}|${lc}|${i}`;
  const have = new Map(existing.map((e) => [key(e.source_type, e.source_id, e.locale, e.chunk_index), e]));
  const wanted = new Set<string>();
  const pending: KbChunk[] = [];
  for (const c of chunks) {
    const k = key(c.doc.sourceType, c.doc.sourceId, c.doc.locale, c.index);
    wanted.add(k);
    if (opts.force || have.get(k)?.content_hash !== c.hash) pending.push(c);
  }
  const stale = existing.filter((e) => !wanted.has(key(e.source_type, e.source_id, e.locale, e.chunk_index))).map((e) => e.id);
  let deleted = 0;
  if (stale.length) deleted = await db.exec(`DELETE FROM ${T.embeddings} WHERE id = ANY($1::uuid[])`, [stale]);

  const unchanged = chunks.length - pending.length;
  let embedded = 0;
  let tokens = 0;
  const progress = () => opts.onProgress?.({ chunks: chunks.length, embedded, unchanged, deleted, tokens, sources });
  await progress();

  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    const batch = pending.slice(i, i + EMBED_BATCH);
    const r = await provider.embed(batch.map((b) => b.content), model);
    tokens += r.tokens;
    const rows = batch.map((b, k) => ({ b, v: r.vectors[k] })).filter((x): x is { b: KbChunk; v: number[] } => Array.isArray(x.v));
    if (rows.length) {
      await db.query(
        `INSERT INTO ${T.embeddings} (source_type, source_id, subject_id, unit_id, lesson_id, locale, chunk_index, title, content, content_hash, model, tokens, embedding)
         SELECT x.st, x.sid, x.subj, x.unit, x.lesson, x.lc, x.idx, x.title, x.content, x.hash, $12, x.tok, x.emb::${vec.type}
           FROM unnest($1::text[], $2::uuid[], $3::uuid[], $4::uuid[], $5::uuid[], $6::text[], $7::int[], $8::text[], $9::text[], $10::text[], $11::text[], $13::int[])
                AS x(st, sid, subj, unit, lesson, lc, idx, title, content, hash, emb, tok)
         ON CONFLICT (source_type, source_id, locale, chunk_index) DO UPDATE SET
           subject_id = EXCLUDED.subject_id, unit_id = EXCLUDED.unit_id, lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title,
           content = EXCLUDED.content, content_hash = EXCLUDED.content_hash, model = EXCLUDED.model, tokens = EXCLUDED.tokens,
           embedding = EXCLUDED.embedding, updated_at = now()`,
        [
          rows.map((x) => x.b.doc.sourceType),
          rows.map((x) => x.b.doc.sourceId),
          rows.map((x) => x.b.doc.subjectId),
          rows.map((x) => x.b.doc.unitId),
          rows.map((x) => x.b.doc.lessonId),
          rows.map((x) => x.b.doc.locale),
          rows.map((x) => x.b.index),
          rows.map((x) => x.b.doc.title),
          rows.map((x) => x.b.content),
          rows.map((x) => x.b.hash),
          rows.map((x) => `[${x.v.join(',')}]`),
          model,
          rows.map((x) => Math.max(1, Math.round((r.tokens * x.b.content.length) / Math.max(1, batch.reduce((n, y) => n + y.content.length, 0))))),
        ],
      );
    }
    embedded += rows.length;
    await progress();
  }
  const costUsd = real ? (tokens / 1_000_000) * env.AI_EMBEDDING_COST_PER_1M_USD : 0;
  return { skipped: null, sources, chunks: chunks.length, embedded, unchanged, deleted, tokens, costUsd: Math.round(costUsd * 1e6) / 1e6, model };
}

// ── runs (admin progress / status) ────────────────────────────────────────────────────────────────

export type KbTrigger = 'manual' | 'content' | 'cron' | 'script';

export interface KbRunRow {
  id: string;
  trigger: KbTrigger;
  scope: KbScope | Record<string, never>;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped';
  model: string;
  sources_total: number;
  sources_done: number;
  chunks_total: number;
  chunks_embedded: number;
  chunks_unchanged: number;
  chunks_deleted: number;
  tokens: number;
  cost_usd: string | number;
  error: string | null;
  requested_by: string | null;
  rb_name_en?: string | null;
  rb_name_ar?: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
}

export async function createRun(trigger: KbTrigger, scope: KbScope | undefined, requestedBy: string | null, force = false): Promise<KbRunRow> {
  return db.one<KbRunRow>(
    `INSERT INTO ${T.kb_index_runs} (trigger, scope, requested_by) VALUES ($1, $2::jsonb, $3) RETURNING *`,
    [trigger, JSON.stringify({ ...(scope ?? { full: true }), ...(force ? { force: true } : {}) }), requestedBy],
  );
}

/** Execute a run (job handler). Never throws: failures are recorded on the run row. */
export async function executeRun(runId: string): Promise<KbRunRow | null> {
  const run = await db.maybeOne<KbRunRow>(`SELECT * FROM ${T.kb_index_runs} WHERE id = $1`, [runId]);
  if (!run || run.status === 'completed' || run.status === 'running') return run;
  const raw = (run.scope ?? {}) as KbScope & { full?: boolean; force?: boolean };
  const scope: KbScope | undefined = raw.full ? undefined : { types: raw.types, ids: raw.ids };
  await db.query(`UPDATE ${T.kb_index_runs} SET status = 'running', started_at = now(), updated_at = now(), error = NULL WHERE id = $1`, [runId]);
  let lastWrite = 0;
  try {
    const r = await syncKnowledgeBase(scope, {
      force: !!raw.force,
      onProgress: async (p) => {
        if (Date.now() - lastWrite < 700) return;
        lastWrite = Date.now();
        await db
          .query(
            `UPDATE ${T.kb_index_runs} SET sources_total = $2, chunks_total = $3, chunks_embedded = $4, chunks_unchanged = $5, chunks_deleted = $6, tokens = $7, updated_at = now() WHERE id = $1`,
            [runId, p.sources, p.chunks, p.embedded, p.unchanged, p.deleted, p.tokens],
          )
          .catch(() => undefined);
      },
    });
    if (r.embedded || r.deleted) {
      const { invalidateVectorCache } = await import('./retrieval.js');
      invalidateVectorCache();
    }
    return await db.one<KbRunRow>(
      `UPDATE ${T.kb_index_runs} SET status = $2, model = $3, sources_total = $4, sources_done = $4, chunks_total = $5, chunks_embedded = $6,
              chunks_unchanged = $7, chunks_deleted = $8, tokens = $9, cost_usd = $10, error = $11, finished_at = now(), updated_at = now()
        WHERE id = $1 RETURNING *`,
      [runId, r.skipped ? 'skipped' : 'completed', r.model, r.sources, r.chunks, r.embedded, r.unchanged, r.deleted, r.tokens, r.costUsd, r.skipped],
    );
  } catch (err) {
    logger.error({ err: (err as Error).message, runId }, 'knowledge-base index run failed');
    return db.maybeOne<KbRunRow>(`UPDATE ${T.kb_index_runs} SET status = 'failed', error = $2, finished_at = now(), updated_at = now() WHERE id = $1 RETURNING *`, [
      runId,
      (err as Error).message.slice(0, 500),
    ]);
  }
}

export interface KbRunDto {
  id: string;
  trigger: KbTrigger;
  status: KbRunRow['status'];
  full: boolean;
  progressPct: number;
  model: string;
  sourcesTotal: number;
  chunksTotal: number;
  chunksEmbedded: number;
  chunksUnchanged: number;
  chunksDeleted: number;
  tokens: number;
  costUsd: number;
  error: string | null;
  requestedBy: { id: string; name: { en: string; ar: string } } | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export function toRunDto(r: KbRunRow): KbRunDto {
  const done = r.chunks_embedded + r.chunks_unchanged;
  const pct = r.status === 'completed' || r.status === 'skipped' ? 100 : r.chunks_total ? Math.min(99, Math.round((done / r.chunks_total) * 100)) : 0;
  return {
    id: r.id,
    trigger: r.trigger,
    status: r.status,
    full: !!(r.scope as { full?: boolean }).full,
    progressPct: pct,
    model: r.model,
    sourcesTotal: r.sources_total,
    chunksTotal: r.chunks_total,
    chunksEmbedded: r.chunks_embedded,
    chunksUnchanged: r.chunks_unchanged,
    chunksDeleted: r.chunks_deleted,
    tokens: r.tokens,
    costUsd: Number(r.cost_usd),
    error: r.error,
    requestedBy: r.requested_by ? { id: r.requested_by, name: { en: r.rb_name_en ?? '', ar: r.rb_name_ar ?? r.rb_name_en ?? '' } } : null,
    startedAt: r.started_at?.toISOString() ?? null,
    finishedAt: r.finished_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
  };
}

export interface KbStatusDto {
  available: boolean;
  embeddingModel: string;
  realEmbeddings: boolean;
  totals: { sources: number; chunks: number; tokens: number; byType: Record<KnowledgeSourceType, { sources: number; chunks: number }> };
  lastIndexedAt: string | null;
  running: boolean;
  lastRun: KbRunDto | null;
  recentRuns: KbRunDto[];
}

export async function knowledgeBaseStatus(): Promise<KbStatusDto> {
  const { model, real } = embeddingProvider();
  const vec = await vectorSql();
  const byType = Object.fromEntries(KB_SOURCE_TYPES.map((t) => [t, { sources: 0, chunks: 0 }])) as KbStatusDto['totals']['byType'];
  let totals = { sources: 0, chunks: 0, tokens: 0 };
  let lastIndexedAt: string | null = null;
  if (vec) {
    const rows = await db.many<{ source_type: KnowledgeSourceType; sources: number; chunks: number; tokens: number; last: Date | null }>(
      `SELECT source_type, count(DISTINCT source_id)::int AS sources, count(*)::int AS chunks, coalesce(sum(tokens), 0)::int AS tokens, max(updated_at) AS last
         FROM ${T.embeddings} GROUP BY source_type`,
    );
    for (const r of rows) {
      if (byType[r.source_type]) byType[r.source_type] = { sources: r.sources, chunks: r.chunks };
      totals = { sources: totals.sources + r.sources, chunks: totals.chunks + r.chunks, tokens: totals.tokens + r.tokens };
      if (r.last && (!lastIndexedAt || r.last.toISOString() > lastIndexedAt)) lastIndexedAt = r.last.toISOString();
    }
  }
  const runs = await db.many<KbRunRow>(
    `SELECT r.*, u.name_en AS rb_name_en, u.name_ar AS rb_name_ar FROM ${T.kb_index_runs} r LEFT JOIN ${T.users} u ON u.id = r.requested_by
      ORDER BY r.created_at DESC LIMIT 5`,
  );
  const dtos = runs.map(toRunDto);
  return {
    available: !!vec,
    embeddingModel: model,
    realEmbeddings: real,
    totals: { ...totals, byType },
    lastIndexedAt,
    running: dtos.some((r) => r.status === 'running' || (r.status === 'queued' && Date.now() - Date.parse(r.createdAt) < 10 * 60_000)),
    lastRun: dtos[0] ?? null,
    recentRuns: dtos,
  };
}

// ── content-change trigger (debounced) ──────────────────────────────────────────────────────────

let pendingScope: KbScope | undefined | null = null; // null = nothing pending; undefined = full
let timer: NodeJS.Timeout | null = null;

/** Queue a scoped, debounced sync after an admin content mutation. Never throws. */
export function queueContentSync(scope: KbScope, delayMs = 4000): void {
  pendingScope = pendingScope === null ? scope : mergeScopes(pendingScope, scope);
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const s = pendingScope;
    pendingScope = null;
    if (s === null) return;
    void (async () => {
      const run = await createRun('content', s, null);
      const { enqueue } = await import('../../jobs/index.js');
      await enqueue('eduway.kb-index', { runId: run.id });
    })().catch((err: Error) => logger.warn({ err: err.message }, 'knowledge-base content sync not queued'));
  }, delayMs);
  timer.unref();
}

let hooked = false;

/** Re-index changed content after successful admin mutations (debounced; off under NODE_ENV=test). */
export function registerKnowledgeBaseHooks(): void {
  if (hooked || env.NODE_ENV === 'test') return;
  hooked = true;
  onAdminMutation((e) => {
    const scope = kbScopeForMutation(e.path, e.entity, e.entityId);
    if (scope) queueContentSync(scope);
  });
}
