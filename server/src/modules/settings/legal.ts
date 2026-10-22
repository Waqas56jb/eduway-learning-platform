/**
 * Legal documents: versioning (draft → published → retired), acceptance stats, and the public
 * LegalDocumentDto parser (markdown body: intro, then one "## Title" heading per section).
 */
import { T } from '../../config/constants.js';
import { db, tx } from '../../config/db.js';
import { adminRef, type AdminRef } from '../../common/dto/refs.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { invalidatePrincipal } from '../../common/auth/principal.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { likeContains } from '../../common/utils/like.js';

export type LegalDoc = 'terms' | 'privacy';

export interface LegalVersionDto {
  id: string;
  doc: LegalDoc;
  version: string;
  title: Localized;
  body: Localized;
  status: 'draft' | 'published' | 'retired';
  publishedAt: string | null;
  acceptances: number;
  changeSummary: Localized | null;
  createdBy: AdminRef;
  createdAt: string;
  updatedAt: string;
}

export interface LegalDocumentDto {
  doc: LegalDoc;
  version: string;
  publishedAt: string;
  updatedAt: string;
  title: Localized;
  subtitle: Localized;
  intro: Localized;
  sections: { id: string; title: Localized; body: Localized }[];
  contactEmail: string;
}

const SELECT = `
  SELECT d.*, (SELECT count(*)::int FROM ${T.legal_acceptances} a WHERE a.document_id = d.id) AS acceptances,
         u.id AS c_id, u.name_en AS c_name_en, u.name_ar AS c_name_ar, u.avatar_url AS c_avatar_url
    FROM ${T.legal_documents} d LEFT JOIN ${T.users} u ON u.id = d.created_by`;

const SYSTEM_REF: AdminRef = { id: '', name: { en: 'System', ar: 'النظام' }, avatarUrl: null };

function toDto(r: Record<string, unknown>): LegalVersionDto {
  return {
    id: String(r.id),
    doc: r.doc_type as LegalDoc,
    version: String(r.version),
    title: { en: String(r.title_en), ar: String(r.title_ar) },
    body: { en: String(r.body_en), ar: String(r.body_ar) },
    status: r.status as LegalVersionDto['status'],
    publishedAt: r.published_at ? (r.published_at as Date).toISOString() : null,
    acceptances: Number(r.acceptances ?? 0),
    changeSummary: r.change_summary_en || r.change_summary_ar ? { en: String(r.change_summary_en ?? ''), ar: String(r.change_summary_ar ?? '') } : null,
    createdBy: adminRef(r, 'c_') ?? SYSTEM_REF,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

/** Split markdown into intro + sections on "## " headings. */
export function parseLegalMarkdown(md: string): { intro: string; sections: { title: string; body: string }[] } {
  const parts = md.replace(/\r\n/g, '\n').split(/^##\s+/m);
  const intro = (parts.shift() ?? '').trim();
  return { intro, sections: parts.map((p) => {
    const [title = '', ...rest] = p.split('\n');
    return { title: title.trim(), body: rest.join('\n').trim() };
  }) };
}

const slug = (s: string, i: number) => s.toLowerCase().replace(/^\d+[.)]\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `section-${i + 1}`;

function nextMinor(v: string | undefined): string {
  if (!v) return '1.0';
  const [maj = '1', min = '0'] = v.split('.');
  return `${Number(maj) || 1}.${(Number(min) || 0) + 1}`;
}

async function getRow(id: string) {
  const r = await db.maybeOne<Record<string, unknown>>(`${SELECT} WHERE d.id = $1`, [id]);
  if (!r) throw new NotFoundError('legalDocument');
  return r;
}

export const legalService = {
  async versions(doc: LegalDoc): Promise<LegalVersionDto[]> {
    const rows = await db.many<Record<string, unknown>>(`${SELECT} WHERE d.doc_type = $1 ORDER BY (d.status = 'draft') DESC, d.published_at DESC NULLS LAST, d.created_at DESC`, [doc]);
    return rows.map(toDto);
  },

  get: async (id: string) => toDto(await getRow(id)),

  async createDraft(doc: LegalDoc, input: { version?: string; cloneFromId?: string }, by: string): Promise<LegalVersionDto> {
    const draft = await db.maybeOne<{ id: string }>(`SELECT id FROM ${T.legal_documents} WHERE doc_type = $1 AND status = 'draft'`, [doc]);
    if (draft) throw new ConflictError('DRAFT_EXISTS', { draftId: draft.id });
    const source = input.cloneFromId
      ? await db.maybeOne<Record<string, unknown>>(`SELECT * FROM ${T.legal_documents} WHERE id = $1 AND doc_type = $2`, [input.cloneFromId, doc])
      : await db.maybeOne<Record<string, unknown>>(`SELECT * FROM ${T.legal_documents} WHERE doc_type = $1 ORDER BY (status = 'published') DESC, created_at DESC LIMIT 1`, [doc]);
    if (input.cloneFromId && !source) throw new NotFoundError('legalDocument');
    const latest = await db.scalar<string>(`SELECT version FROM ${T.legal_documents} WHERE doc_type = $1 ORDER BY created_at DESC LIMIT 1`, [doc]);
    const version = input.version ?? nextMinor(latest ?? undefined);
    const row = await db.one<{ id: string }>(
      `INSERT INTO ${T.legal_documents} (doc_type, version, title_en, title_ar, subtitle_en, subtitle_ar, body_en, body_ar, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9) RETURNING id`,
      [doc, version, source?.title_en ?? '', source?.title_ar ?? '', source?.subtitle_en ?? '', source?.subtitle_ar ?? '', source?.body_en ?? '', source?.body_ar ?? '', by],
    );
    return this.get(row.id);
  },

  async update(id: string, patch: { version?: string; title?: Localized; body?: Localized; changeSummary?: Localized | null }): Promise<{ before: LegalVersionDto; after: LegalVersionDto }> {
    const before = toDto(await getRow(id));
    if (before.status !== 'draft') throw new BusinessRuleError('INVALID_TRANSITION', { from: before.status, to: 'draft' });
    await db.query(
      `UPDATE ${T.legal_documents} SET version = COALESCE($2, version), title_en = COALESCE($3, title_en), title_ar = COALESCE($4, title_ar),
              body_en = COALESCE($5, body_en), body_ar = COALESCE($6, body_ar),
              change_summary_en = CASE WHEN $7::boolean THEN $8 ELSE change_summary_en END,
              change_summary_ar = CASE WHEN $7::boolean THEN $9 ELSE change_summary_ar END
        WHERE id = $1`,
      [id, patch.version ?? null, patch.title?.en ?? null, patch.title?.ar ?? null, patch.body?.en ?? null, patch.body?.ar ?? null, patch.changeSummary !== undefined, patch.changeSummary?.en ?? null, patch.changeSummary?.ar ?? null],
    );
    return { before, after: await this.get(id) };
  },

  async publish(id: string, requireReacceptance = true): Promise<{ published: LegalVersionDto; retired: LegalVersionDto | null }> {
    const draft = toDto(await getRow(id));
    if (draft.status !== 'draft') throw new BusinessRuleError('INVALID_TRANSITION', { from: draft.status, to: 'published' });
    if (!draft.version.trim() || !draft.body.en.trim() || !draft.body.ar.trim()) throw new BusinessRuleError('INVALID_TRANSITION', { from: 'draft', to: 'published', missing: 'body' });
    const retiredId = await tx(async (c) => {
      const cur = await db.maybeOne<{ id: string }>(
        `UPDATE ${T.legal_documents} SET status = 'retired', retired_at = now() WHERE doc_type = $1 AND status = 'published' RETURNING id`,
        [draft.doc],
        c,
      );
      await db.query(`UPDATE ${T.legal_documents} SET status = 'published', published_at = now(), requires_acceptance = $2 WHERE id = $1`, [id, requireReacceptance], c);
      return cur?.id ?? null;
    });
    invalidatePrincipal();
    return { published: await this.get(id), retired: retiredId ? await this.get(retiredId) : null };
  },

  async removeDraft(id: string): Promise<LegalVersionDto> {
    const d = toDto(await getRow(id));
    if (d.status !== 'draft') throw new BusinessRuleError('INVALID_TRANSITION', { from: d.status, to: 'deleted' });
    await db.query(`DELETE FROM ${T.legal_documents} WHERE id = $1`, [id]);
    return d;
  },

  async stats(doc: LegalDoc) {
    const cur = await db.maybeOne<{ id: string; version: string; published_at: Date }>(`SELECT id, version, published_at FROM ${T.legal_documents} WHERE doc_type = $1 AND status = 'published'`, [doc]);
    const totalStudents = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.users} WHERE kind = 'student' AND deleted_at IS NULL`)) ?? 0;
    const acceptances = cur ? ((await db.scalar<number>(`SELECT count(*)::int FROM ${T.legal_acceptances} WHERE document_id = $1`, [cur.id])) ?? 0) : 0;
    const byVersion = await db.many<{ version: string; acceptances: number }>(
      `SELECT d.version, count(a.id)::int AS acceptances FROM ${T.legal_documents} d LEFT JOIN ${T.legal_acceptances} a ON a.document_id = d.id
        WHERE d.doc_type = $1 AND d.status <> 'draft' GROUP BY d.id, d.version, d.published_at ORDER BY d.published_at NULLS LAST`,
      [doc],
    );
    return {
      currentVersion: cur?.version ?? null,
      publishedAt: cur?.published_at.toISOString() ?? null,
      acceptances,
      totalStudents,
      rate: totalStudents ? Math.round((acceptances / totalStudents) * 1000) / 10 : 0,
      pendingReacceptance: Math.max(0, totalStudents - acceptances),
      byVersion,
    };
  },

  async acceptances(id: string, q: string | undefined, limit: number, offset: number) {
    await getRow(id);
    const p: unknown[] = [id];
    let where = '';
    if (q) {
      p.push(likeContains(q.toLowerCase()));
      where = ` AND (lower(u.name_en) LIKE $2 OR u.name_ar LIKE $2 OR u.phone LIKE $2)`;
    }
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.legal_acceptances} a JOIN ${T.users} u ON u.id = a.user_id WHERE a.document_id = $1${where}`, p)) ?? 0;
    const rows = await db.many<Record<string, unknown>>(
      `SELECT a.accepted_at, a.platform, a.ip, u.id, u.name_en, u.name_ar, u.phone, u.avatar_url
         FROM ${T.legal_acceptances} a JOIN ${T.users} u ON u.id = a.user_id WHERE a.document_id = $1${where}
        ORDER BY a.accepted_at DESC LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
      [...p, limit, offset],
    );
    return {
      total,
      items: rows.map((r) => ({
        student: { id: String(r.id), name: { en: String(r.name_en), ar: String(r.name_ar || r.name_en) }, mobile: String(r.phone ?? ''), avatarUrl: (r.avatar_url as string | null) ?? null },
        acceptedAt: (r.accepted_at as Date).toISOString(),
        platform: (r.platform as string | null) ?? 'web',
        ip: String(r.ip ?? ''),
      })),
    };
  },

  /** PUB-11 */
  async publicDocument(doc: LegalDoc, version?: string): Promise<LegalDocumentDto> {
    const r = await db.maybeOne<Record<string, unknown>>(
      version
        ? `SELECT * FROM ${T.legal_documents} WHERE doc_type = $1 AND version = $2 AND status <> 'draft'`
        : `SELECT * FROM ${T.legal_documents} WHERE doc_type = $1 AND status = 'published'`,
      version ? [doc, version] : [doc],
    );
    if (!r) throw new NotFoundError('legalDocument');
    const en = parseLegalMarkdown(String(r.body_en));
    const ar = parseLegalMarkdown(String(r.body_ar));
    const support = await settingsStore.get('support');
    return {
      doc,
      version: String(r.version),
      publishedAt: ((r.published_at as Date | null) ?? (r.created_at as Date)).toISOString(),
      updatedAt: (r.updated_at as Date).toISOString(),
      title: { en: String(r.title_en), ar: String(r.title_ar) },
      subtitle: { en: String(r.subtitle_en ?? ''), ar: String(r.subtitle_ar ?? '') },
      intro: { en: en.intro, ar: ar.intro },
      sections: en.sections.map((s, i) => ({ id: slug(s.title, i), title: { en: s.title, ar: ar.sections[i]?.title ?? s.title }, body: { en: s.body, ar: ar.sections[i]?.body ?? s.body } })),
      contactEmail: support.email || 'support@eduway.iq',
    };
  },
};
