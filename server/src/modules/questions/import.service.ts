/**
 * Question bulk import (ADM-IMP-*, API_CONTRACT §22.1 + §34.5): template download, upload (fileKey or multipart),
 * parse CSV/XLSX, validate every row, detect duplicates, preview (paginated), commit valid rows as drafts.
 */
import ExcelJS from 'exceljs';
import { T } from '../../config/constants.js';
import { db, tx } from '../../config/db.js';
import { supabaseService } from '../../config/supabase.js';
import { AppError, NotFoundError } from '../../common/errors/index.js';
import { adminInbox } from '../../common/services/admin-inbox.js';
import { buildExport, type ExportColumn } from '../../common/services/exporter.js';
import { storage } from '../../common/services/storage.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { normalizeText, ruleError, similarity } from '../learning-core/index.js';
import { insertQuestion } from './admin.service.js';

export const IMPORT_COLUMNS = [
  'subject', 'unit', 'topic', 'type', 'difficulty', 'body_en', 'body_ar',
  'option_a_en', 'option_a_ar', 'option_b_en', 'option_b_ar', 'option_c_en', 'option_c_ar', 'option_d_en', 'option_d_ar',
  'correct', 'explanation_en', 'explanation_ar', 'tags', 'source', 'year',
] as const;
type Col = (typeof IMPORT_COLUMNS)[number];
type Raw = Record<string, string>;
type Lang = 'en' | 'ar';

const SAMPLE_ROWS: Raw[] = [
  { subject: 'math', unit: '1', topic: '1', type: 'mcq', difficulty: 'easy', body_en: 'What is the value of $i^2$?', body_ar: 'ما قيمة $i^2$؟', option_a_en: '1', option_a_ar: '1', option_b_en: '-1', option_b_ar: '-1', option_c_en: 'i', option_c_ar: 'i', option_d_en: '0', option_d_ar: '0', correct: 'B', explanation_en: 'By definition i squared equals -1.', explanation_ar: 'حسب التعريف مربع i يساوي -1.', tags: 'basics;ministerial', source: 'EDUWAY Original', year: '' },
  { subject: 'physics', unit: '1', topic: '1', type: 'true_false', difficulty: 'medium', body_en: 'A capacitor stores electric charge.', body_ar: 'المتسعة تخزن الشحنة الكهربائية.', option_a_en: 'True', option_a_ar: 'صح', option_b_en: 'False', option_b_ar: 'خطأ', option_c_en: '', option_c_ar: '', option_d_en: '', option_d_ar: '', correct: 'A', explanation_en: 'Capacitors store charge on their plates.', explanation_ar: 'تخزن المتسعة الشحنة على صفيحتيها.', tags: 'concept', source: 'Ministerial Exam', year: '2023' },
  { subject: 'chemistry', unit: '1', topic: '1', type: 'fill_blank', difficulty: 'hard', body_en: 'The SI unit of amount of substance is the ______.', body_ar: 'وحدة كمية المادة في النظام الدولي هي ______.', option_a_en: 'mole', option_a_ar: 'المول', option_b_en: '', option_b_ar: '', option_c_en: '', option_c_ar: '', option_d_en: '', option_d_ar: '', correct: 'A', explanation_en: 'The mole is the SI base unit for amount of substance.', explanation_ar: 'المول هو الوحدة الأساسية لكمية المادة.', tags: 'definition', source: '', year: '' },
];

const MSG: Record<string, Record<Lang, string>> = {
  required: { en: 'Required', ar: 'مطلوب' },
  subject: { en: 'Unknown subject slug', ar: 'رمز المادة غير معروف' },
  unit: { en: 'Unknown unit number for this subject', ar: 'رقم الوحدة غير موجود لهذه المادة' },
  topic: { en: 'Unknown topic number for this unit', ar: 'رقم الموضوع غير موجود لهذه الوحدة' },
  type: { en: 'Must be mcq, true_false or fill_blank', ar: 'يجب أن يكون mcq أو true_false أو fill_blank' },
  difficulty: { en: 'Must be easy, medium or hard', ar: 'يجب أن يكون easy أو medium أو hard' },
  body_en: { en: 'At least 8 characters', ar: '8 أحرف على الأقل' },
  body_ar: { en: 'At least 5 characters', ar: '5 أحرف على الأقل' },
  options: { en: 'At least 2 options are required', ar: 'مطلوب خياران على الأقل' },
  option_pair: { en: 'Both English and Arabic text are required', ar: 'النص الإنجليزي والعربي مطلوبان' },
  correct: { en: 'Must be the letter of a present option', ar: 'يجب أن يكون حرف خيار موجود' },
  year: { en: 'Empty or a year between 2000 and 2027', ar: 'فارغ أو سنة بين 2000 و2027' },
  explanation: { en: 'Explanation is required', ar: 'الشرح مطلوب' },
};

export interface ImportRow {
  row: number;
  raw: Raw;
  errors: Record<string, string>;
  valid: boolean;
  duplicateOf: { id: string; code: string } | null;
  resolved: { subject: { id: string; slug: string; name: { en: string; ar: string }; color: string } | null; unit: { id: string; name: { en: string; ar: string }; order: number } | null; topic: { id: string; name: { en: string; ar: string }; order: number; unitId: string } | null };
}

// ── parsing ─────────────────────────────────────────────────────────────────────────────────────────

/** RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

async function parseXlsx(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals: string[] = [];
    for (let c = 1; c <= Math.max(r.cellCount, IMPORT_COLUMNS.length); c++) {
      const v = r.getCell(c).value;
      vals.push(v === null || v === undefined ? '' : typeof v === 'object' && 'text' in (v as object) ? String((v as { text: unknown }).text) : typeof v === 'object' && 'result' in (v as object) ? String((v as { result: unknown }).result ?? '') : String(v));
    }
    out.push(vals);
  });
  return out.filter((r) => r.some((c) => c.trim() !== ''));
}

export async function parseFile(buf: Buffer, fileName: string): Promise<{ header: string[]; rows: Raw[] }> {
  const isXlsx = /\.xlsx?$/i.test(fileName) || (buf[0] === 0x50 && buf[1] === 0x4b);
  const grid = isXlsx ? await parseXlsx(buf) : parseCsv(buf.toString('utf8'));
  if (grid.length < 2) throw new AppError('VALIDATION_ERROR', 400, { reason: 'IMPORT_FILE_INVALID' as never, details: { why: 'empty' } });
  const header = (grid[0] as string[]).map((h) => h.trim().toLowerCase());
  const missing = IMPORT_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 4) throw new AppError('VALIDATION_ERROR', 400, { reason: 'IMPORT_FILE_INVALID' as never, details: { missing } });
  const rows = grid.slice(1).map((cells) => Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, (cells[header.indexOf(c)] ?? '').trim()])) as Raw);
  return { header, rows };
}

// ── validation ──────────────────────────────────────────────────────────────────────────────────────

interface Catalog {
  subjects: Map<string, { id: string; slug: string; name_en: string; name_ar: string; color: string }>;
  units: Map<string, { id: string; title_en: string; title_ar: string; order: number }>; // `${subjectId}:${order}`
  topics: Map<string, { id: string; title_en: string; title_ar: string; order: number; unit_id: string }>; // `${unitId}:${order}`
}

async function loadCatalog(): Promise<Catalog> {
  const subjects = await db.many<{ id: string; slug: string; name_en: string; name_ar: string; color: string }>(`SELECT id, slug, name_en, name_ar, color FROM ${T.subjects} WHERE deleted_at IS NULL`);
  const units = await db.many<{ id: string; subject_id: string; title_en: string; title_ar: string; ord: number }>(
    `SELECT id, subject_id, title_en, title_ar, row_number() OVER (PARTITION BY subject_id ORDER BY sort_order, created_at)::int AS ord FROM ${T.units} WHERE deleted_at IS NULL`,
  );
  const topics = await db.many<{ id: string; unit_id: string; title_en: string; title_ar: string; ord: number }>(
    `SELECT id, unit_id, title_en, title_ar, row_number() OVER (PARTITION BY unit_id ORDER BY sort_order, created_at)::int AS ord FROM ${T.topics} WHERE deleted_at IS NULL`,
  );
  return {
    subjects: new Map(subjects.map((s) => [s.slug.toLowerCase(), s])),
    units: new Map(units.map((u) => [`${u.subject_id}:${u.ord}`, { id: u.id, title_en: u.title_en, title_ar: u.title_ar, order: u.ord }])),
    topics: new Map(topics.map((t) => [`${t.unit_id}:${t.ord}`, { id: t.id, title_en: t.title_en, title_ar: t.title_ar, order: t.ord, unit_id: t.unit_id }])),
  };
}

const LETTERS = ['a', 'b', 'c', 'd'] as const;

export function validateRow(raw: Raw, rowNo: number, cat: Catalog, lang: Lang): ImportRow {
  const errors: Record<string, string> = {};
  const err = (col: Col | string, key: string) => {
    if (!errors[col]) errors[col] = MSG[key]?.[lang] ?? key;
  };
  const subj = cat.subjects.get((raw.subject ?? '').toLowerCase());
  if (!raw.subject) err('subject', 'required');
  else if (!subj) err('subject', 'subject');
  const unit = subj ? cat.units.get(`${subj.id}:${Number(raw.unit)}`) : undefined;
  if (subj && !unit) err('unit', 'unit');
  const topic = unit ? cat.topics.get(`${unit.id}:${Number(raw.topic)}`) : undefined;
  if (unit && !topic) err('topic', 'topic');
  const type = raw.type?.toLowerCase();
  if (!['mcq', 'true_false', 'fill_blank'].includes(type ?? '')) err('type', 'type');
  if (!['easy', 'medium', 'hard'].includes((raw.difficulty ?? '').toLowerCase())) err('difficulty', 'difficulty');
  if ((raw.body_en ?? '').length < 8) err('body_en', 'body_en');
  if ((raw.body_ar ?? '').length < 5) err('body_ar', 'body_ar');
  const present = LETTERS.filter((l) => raw[`option_${l}_en`] || raw[`option_${l}_ar`]);
  for (const l of present) {
    if (!raw[`option_${l}_en`]) err(`option_${l}_en`, 'option_pair');
    if (!raw[`option_${l}_ar`]) err(`option_${l}_ar`, 'option_pair');
  }
  if (type !== 'fill_blank' && present.length < 2) err('option_a_en', 'options');
  const correct = (raw.correct ?? '').trim().toLowerCase();
  if (!present.includes(correct as (typeof LETTERS)[number])) err('correct', 'correct');
  if (raw.year && !(/^\d{4}$/.test(raw.year) && Number(raw.year) >= 2000 && Number(raw.year) <= 2027)) err('year', 'year');
  if (!raw.explanation_en) err('explanation_en', 'explanation');
  if (!raw.explanation_ar) err('explanation_ar', 'explanation');
  return {
    row: rowNo,
    raw,
    errors,
    valid: Object.keys(errors).length === 0,
    duplicateOf: null,
    resolved: {
      subject: subj ? { id: subj.id, slug: subj.slug, name: { en: subj.name_en, ar: subj.name_ar }, color: subj.color } : null,
      unit: unit ? { id: unit.id, name: { en: unit.title_en, ar: unit.title_ar }, order: unit.order } : null,
      topic: topic ? { id: topic.id, name: { en: topic.title_en, ar: topic.title_ar }, order: topic.order, unitId: topic.unit_id } : null,
    },
  };
}

async function markDuplicates(rows: ImportRow[]) {
  const topicIds = [...new Set(rows.map((r) => r.resolved.topic?.id).filter((x): x is string => !!x))];
  const existing = topicIds.length
    ? await db.many<{ id: string; code: string; topic_id: string; body_en: string }>(`SELECT id, code, topic_id, body_en FROM ${T.questions} WHERE topic_id = ANY($1::uuid[]) AND deleted_at IS NULL`, [topicIds])
    : [];
  for (const r of rows) {
    const t = r.resolved.topic?.id;
    if (!t) continue;
    const hit = existing.filter((e) => e.topic_id === t).find((e) => similarity(r.raw.body_en ?? '', e.body_en) >= 0.8);
    if (hit) r.duplicateOf = { id: hit.id, code: hit.code };
  }
}

// ── persistence ─────────────────────────────────────────────────────────────────────────────────────

interface ImportRecord {
  id: string;
  file_name: string;
  status: 'uploaded' | 'previewed' | 'processing' | 'committed' | 'failed';
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  errors: unknown;
  preview: ImportRow[];
  created_at: Date;
  expires_at: Date | null;
  created_ids: string[];
}

const statusOf = (r: ImportRecord) => {
  if (r.status === 'committed') return 'committed';
  if (r.status === 'failed') return 'failed';
  if (r.status === 'uploaded' || r.status === 'processing') return 'parsing';
  return (r.expires_at ?? new Date(r.created_at.getTime() + 86_400_000)).getTime() < Date.now() ? 'expired' : 'ready';
};

function previewDto(r: ImportRecord, rows: ImportRow[]) {
  const failureReason = r.status === 'failed' ? ((r.errors as { failureReason?: string } | null)?.failureReason ?? 'IMPORT_PARSE_FAILED') : null;
  return {
    importId: r.id,
    fileName: r.file_name,
    status: statusOf(r),
    failureReason,
    totals: { rows: r.total_rows, valid: r.valid_rows, invalid: r.error_rows },
    rows,
    createdAt: r.created_at.toISOString(),
    expiresAt: (r.expires_at ?? new Date(r.created_at.getTime() + 86_400_000)).toISOString(),
  };
}

async function getRecord(id: string): Promise<ImportRecord> {
  const r = await db.maybeOne<ImportRecord>(`SELECT id, file_name, status, total_rows, valid_rows, error_rows, errors, preview, created_at, expires_at, created_ids FROM ${T.question_imports} WHERE id = $1`, [id]);
  if (!r) throw new NotFoundError('import');
  return r;
}

export const importService = {
  async template(format: 'csv' | 'xlsx') {
    const cols: ExportColumn<Raw>[] = IMPORT_COLUMNS.map((c) => ({ key: c, header: c, value: (r) => r[c] ?? '' }));
    return { buf: await buildExport(format, cols, SAMPLE_ROWS, 'questions'), fileName: `eduway-question-import-template.${format}` };
  },

  async upload(input: { fileKey?: string; file?: { buffer: Buffer; originalname: string } }, admin: AdminPrincipal, lang: Lang) {
    let buf: Buffer;
    let fileName: string;
    let fileKey: string | null = null;
    let bucket: string | null = null;
    let path: string | null = null;
    if (input.file) {
      buf = input.file.buffer;
      fileName = input.file.originalname;
    } else if (input.fileKey) {
      const up = await storage.attachUpload(input.fileKey, { purpose: 'question_import', entityType: 'question_import', entityId: admin.userId });
      const { data, error } = await supabaseService.storage.from(up.bucket).download(up.path);
      if (error || !data) throw new AppError('INTERNAL', 502, { reason: 'STORAGE_ERROR' });
      buf = Buffer.from(await data.arrayBuffer());
      fileName = up.file_name;
      fileKey = input.fileKey;
      bucket = up.bucket;
      path = up.path;
    } else throw new AppError('VALIDATION_ERROR', 400, { reason: 'IMPORT_FILE_INVALID' as never, details: { why: 'file or fileKey required' } });

    const rec = await db.one<{ id: string }>(
      `INSERT INTO ${T.question_imports} (file_name, storage_bucket, storage_path, file_key, status, created_by, expires_at) VALUES ($1,$2,$3,$4,'processing',$5, now() + interval '24 hours') RETURNING id`,
      [fileName.slice(0, 200), bucket, path, fileKey, admin.userId],
    );
    try {
      const { rows } = await parseFile(buf, fileName);
      const cat = await loadCatalog();
      const validated = rows.slice(0, 5000).map((r, i) => validateRow(r, i + 2, cat, lang));
      await markDuplicates(validated);
      // In-file duplicates (same topic, similarity ≥ 0.8 with an earlier row).
      for (let i = 0; i < validated.length; i++) {
        const a = validated[i] as ImportRow;
        if (a.duplicateOf || !a.resolved.topic) continue;
        for (let j = 0; j < i; j++) {
          const b = validated[j] as ImportRow;
          if (b.resolved.topic?.id === a.resolved.topic.id && normalizeText(b.raw.body_en ?? '') && similarity(a.raw.body_en ?? '', b.raw.body_en ?? '') >= 0.8) {
            a.duplicateOf = { id: '', code: `row ${b.row}` };
            break;
          }
        }
      }
      const valid = validated.filter((r) => r.valid).length;
      await db.query(
        `UPDATE ${T.question_imports} SET status = 'previewed', total_rows = $2, valid_rows = $3, error_rows = $4, duplicate_rows = $5, preview = $6::jsonb, errors = '[]'::jsonb WHERE id = $1`,
        [rec.id, validated.length, valid, validated.length - valid, validated.filter((r) => r.duplicateOf).length, JSON.stringify(validated)],
      );
    } catch (err) {
      const reason = (err as AppError).reason ?? 'IMPORT_PARSE_FAILED';
      await db.query(`UPDATE ${T.question_imports} SET status = 'failed', errors = $2::jsonb WHERE id = $1`, [rec.id, JSON.stringify({ failureReason: reason, details: (err as AppError).details ?? null })]);
      throw err;
    }
    return this.preview(rec.id, 'all', 1, 25);
  },

  async preview(id: string, filter: 'all' | 'valid' | 'invalid', page: number, pageSize: number) {
    const r = await getRecord(id);
    const rows = (r.preview ?? []).filter((x) => (filter === 'valid' ? x.valid : filter === 'invalid' ? !x.valid : true));
    const slice = rows.slice((page - 1) * pageSize, page * pageSize);
    return { dto: previewDto(r, slice), meta: { page, pageSize, total: rows.length, nextCursor: null } };
  },

  async commit(id: string, admin: AdminPrincipal) {
    const r = await getRecord(id);
    const st = statusOf(r);
    if (st === 'expired') throw ruleError('IMPORT_EXPIRED');
    if (st === 'committed') return { imported: r.created_ids.length, skipped: r.total_rows - r.created_ids.length, createdIds: r.created_ids };
    if (st !== 'ready') throw ruleError('IMPORT_NOT_READY', { status: st });
    const valid = (r.preview ?? []).filter((x) => x.valid && x.resolved.subject && x.resolved.unit && x.resolved.topic);
    const createdIds = await tx(async (c) => {
      const ids: string[] = [];
      for (const row of valid) {
        const raw = row.raw;
        const type = raw.type!.toLowerCase() as 'mcq' | 'true_false' | 'fill_blank';
        const correct = raw.correct!.trim().toLowerCase();
        let options = LETTERS.filter((l) => raw[`option_${l}_en`]).map((l) => ({ text: { en: raw[`option_${l}_en`] as string, ar: raw[`option_${l}_ar`] as string }, correct: l === correct }));
        if (type === 'fill_blank') options = options.filter((o) => o.correct);
        const qid = await insertQuestion(
          {
            type,
            difficulty: raw.difficulty!.toLowerCase() as 'easy' | 'medium' | 'hard',
            subjectId: row.resolved.subject!.id,
            unitId: row.resolved.unit!.id,
            topicId: row.resolved.topic!.id,
            body: { en: raw.body_en as string, ar: raw.body_ar as string },
            explanation: { en: raw.explanation_en as string, ar: raw.explanation_ar as string },
            options,
            tags: (raw.tags ?? '').split(/[;|]/).map((t) => t.trim()).filter(Boolean),
            source: raw.source || 'EDUWAY Original',
            year: raw.year ? Number(raw.year) : null,
            status: 'draft',
          },
          admin.userId,
          c,
          { duplicateOf: row.duplicateOf?.id || null },
        );
        ids.push(qid);
      }
      await db.query(`UPDATE ${T.question_imports} SET status = 'committed', committed_at = now(), created_ids = $2 WHERE id = $1`, [id, ids], c);
      return ids;
    });
    await adminInbox.notify({
      permission: 'questions.approve',
      kind: 'success',
      category: 'questions',
      title: { en: 'Question import completed', ar: 'اكتمل استيراد الأسئلة' },
      body: { en: `${createdIds.length} questions imported as drafts from ${r.file_name}.`, ar: `تم استيراد ${createdIds.length} سؤالاً كمسودات من ${r.file_name}.` },
      href: '/questions',
      dedupeKey: `question-import:${id}`,
    });
    return { imported: createdIds.length, skipped: r.total_rows - createdIds.length, createdIds, fileName: r.file_name };
  },

  async errorsCsv(id: string) {
    const r = await getRecord(id);
    const invalid = (r.preview ?? []).filter((x) => !x.valid);
    const cols: ExportColumn<ImportRow>[] = [
      { key: 'row', header: 'row', value: (x) => x.row },
      ...IMPORT_COLUMNS.map((c) => ({ key: c, header: c, value: (x: ImportRow) => x.raw[c] ?? '' })),
      { key: 'errors', header: 'errors', value: (x) => Object.entries(x.errors).map(([k, v]) => `${k}: ${v}`).join(' | ') },
    ];
    return { buf: await buildExport('csv', cols, invalid), fileName: `question-import-errors-${new Date().toISOString().slice(0, 10)}.csv` };
  },
};

/**
 * Job hook (`question-import`, data `{ importId }`): imports are parsed inline on upload (files ≤ 10 MB / 5000 rows),
 * so the job only reports the current state; kept for large-file processing parity.
 */
export async function processQuestionImport(data: { importId?: string } = {}): Promise<string | null> {
  if (!data.importId) return null;
  const r = await db.maybeOne<{ status: string }>(`SELECT status FROM ${T.question_imports} WHERE id = $1`, [data.importId]);
  return r?.status ?? null;
}
