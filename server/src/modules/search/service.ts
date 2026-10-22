/**
 * Global search (SRC-01), scoped by audience:
 *   student → lessons (default), subjects, questions (entitled subjects only);
 *   admin   → students, lessons (+status), questions, schools, marketers, transactions, admins — each scope requires its
 *             module `.view` permission; scopes without permission are silently omitted.
 * `q` is AND-of-words, case-insensitive, Arabic-normalized.
 */
import { T, type PermissionKey } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { entitlements, evaluateSubjectAccess } from '../../common/entitlements.js';
import { hasPermission } from '../../common/middleware/rbac.js';
import { storage } from '../../common/services/storage.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { sqlSearch } from '../learning-core/index.js';

const STUDENT_SCOPES = ['lessons', 'subjects', 'questions'] as const;
const ADMIN_SCOPES: Record<string, PermissionKey> = {
  students: 'users.view',
  lessons: 'content.view',
  questions: 'questions.view',
  schools: 'schools.view',
  marketers: 'marketers.view',
  transactions: 'payments.view',
  admins: 'security.view',
};

async function lessons(q: string, limit: number, admin: boolean) {
  const params: unknown[] = [];
  const s = sqlSearch(q, ['l.title_en', 'l.title_ar', 'l.description_en', 'l.description_ar'], params);
  params.push(limit);
  const rows = await db.many<{ id: string; title_en: string; title_ar: string; slug: string; name_en: string; name_ar: string; status: string; thumbnail_url: string | null }>(
    `SELECT l.id, l.title_en, l.title_ar, s.slug, s.name_en, s.name_ar, l.status, l.thumbnail_url
       FROM ${T.lessons} l JOIN ${T.subjects} s ON s.id = l.subject_id
      WHERE l.deleted_at IS NULL AND s.deleted_at IS NULL ${admin ? '' : `AND l.status = 'published' AND s.status = 'active'`} AND ${s || 'true'}
      ORDER BY s.sort_order, l.sort_order LIMIT $${params.length}`,
    params,
  );
  const thumbs = await storage.resolveMany(rows.map((r) => r.thumbnail_url));
  return rows.map((r, i) => ({ id: r.id, title: { en: r.title_en, ar: r.title_ar }, subjectSlug: r.slug, subjectName: { en: r.name_en, ar: r.name_ar }, ...(admin ? { status: r.status } : {}), thumbnail: thumbs[i] ?? '' }));
}

async function subjects(q: string, limit: number) {
  const params: unknown[] = [];
  const s = sqlSearch(q, ['s.name_en', 's.name_ar', 's.slug', 's.tagline_en', 's.tagline_ar'], params);
  params.push(limit);
  const rows = await db.many<{ id: string; slug: string; name_en: string; name_ar: string; color: string }>(
    `SELECT s.id, s.slug, s.name_en, s.name_ar, s.color FROM ${T.subjects} s WHERE s.deleted_at IS NULL AND s.status = 'active' AND ${s || 'true'} ORDER BY s.sort_order LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: { en: r.name_en, ar: r.name_ar }, color: r.color }));
}

async function questions(q: string, limit: number, subjectIds: string[] | null) {
  const params: unknown[] = [];
  const s = sqlSearch(q, ['q.code', 'q.body_en', 'q.body_ar'], params);
  let extra = '';
  if (subjectIds) {
    params.push(subjectIds);
    extra = `AND q.subject_id = ANY($${params.length}::uuid[]) AND q.status = 'published'`;
  }
  params.push(limit);
  const rows = await db.many<{ id: string; code: string; body_en: string; body_ar: string; slug: string }>(
    `SELECT q.id, q.code, q.body_en, q.body_ar, s.slug FROM ${T.questions} q JOIN ${T.subjects} s ON s.id = q.subject_id
      WHERE q.deleted_at IS NULL ${extra} AND ${s || 'true'} ORDER BY q.code LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({ id: r.id, code: r.code, text: { en: r.body_en, ar: r.body_ar }, subjectSlug: r.slug }));
}

async function adminScope(scope: string, q: string, limit: number): Promise<unknown[]> {
  const params: unknown[] = [];
  const run = async <R extends Record<string, unknown>>(cols: string[], sql: (w: string, lim: string) => string) => {
    const s = sqlSearch(q, cols, params);
    params.push(limit);
    return db.many<R>(sql(s || 'true', `$${params.length}`), params);
  };
  switch (scope) {
    case 'students': {
      const rows = await run<{ id: string; name_en: string; name_ar: string; phone: string; avatar_url: string | null }>(['u.name_en', 'u.name_ar', 'u.phone'], (w, lim) => `SELECT u.id, u.name_en, u.name_ar, u.phone, u.avatar_url FROM ${T.users} u WHERE u.kind = 'student' AND u.deleted_at IS NULL AND ${w} ORDER BY u.created_at DESC LIMIT ${lim}`);
      const avatars = await storage.resolveMany(rows.map((r) => r.avatar_url));
      return rows.map((r, i) => ({ id: r.id, name: { en: r.name_en, ar: r.name_ar || r.name_en }, mobile: r.phone, avatarUrl: avatars[i] ?? null }));
    }
    case 'schools': {
      const rows = await run<{ id: string; name_en: string; name_ar: string; code: string }>(['sc.name_en', 'sc.name_ar', 'sc.code'], (w, lim) => `SELECT sc.id, sc.name_en, sc.name_ar, sc.code FROM ${T.schools} sc WHERE ${w} ORDER BY sc.name_en LIMIT ${lim}`);
      return rows.map((r) => ({ id: r.id, name: { en: r.name_en, ar: r.name_ar }, code: r.code }));
    }
    case 'marketers': {
      const rows = await run<{ id: string; name_en: string; name_ar: string; avatar_url: string | null }>(['m.name_en', 'm.name_ar', 'm.code', 'm.mobile'], (w, lim) => `SELECT m.id, m.name_en, m.name_ar, m.avatar_url FROM ${T.marketers} m WHERE m.deleted_at IS NULL AND ${w} ORDER BY m.name_en LIMIT ${lim}`);
      return rows.map((r) => ({ id: r.id, name: { en: r.name_en, ar: r.name_ar }, avatarUrl: r.avatar_url }));
    }
    case 'transactions': {
      const rows = await run<{ id: string; ref: string; name_en: string; name_ar: string; total: number; status: string }>(['p.ref', 'u.name_en', 'u.name_ar', 'u.phone'], (w, lim) => `SELECT p.id, p.ref, u.name_en, u.name_ar, p.total, p.status FROM ${T.payments} p JOIN ${T.users} u ON u.id = p.user_id WHERE ${w} ORDER BY p.created_at DESC LIMIT ${lim}`);
      return rows.map((r) => ({ id: r.id, ref: r.ref, studentName: { en: r.name_en, ar: r.name_ar || r.name_en }, amount: r.total, status: r.status }));
    }
    case 'admins': {
      const rows = await run<{ id: string; name_en: string; name_ar: string; email: string }>(['u.name_en', 'u.name_ar', 'u.email'], (w, lim) => `SELECT u.id, u.name_en, u.name_ar, u.email FROM ${T.users} u WHERE u.kind = 'admin' AND u.deleted_at IS NULL AND ${w} ORDER BY u.name_en LIMIT ${lim}`);
      return rows.map((r) => ({ id: r.id, name: { en: r.name_en, ar: r.name_ar || r.name_en }, email: r.email }));
    }
    default:
      return [];
  }
}

export const searchService = {
  async student(userId: string, q: string, scopes: string[] | undefined, limit: number) {
    const wanted = (scopes?.length ? scopes : ['lessons']).filter((s): s is (typeof STUDENT_SCOPES)[number] => (STUDENT_SCOPES as readonly string[]).includes(s));
    const out: Record<string, unknown[]> = {};
    for (const s of wanted) {
      if (s === 'lessons') out.lessons = await lessons(q, limit, false);
      else if (s === 'subjects') out.subjects = await subjects(q, limit);
      else {
        const records = await entitlements.list(userId);
        const all = await db.many<{ id: string }>(`SELECT id FROM ${T.subjects} WHERE deleted_at IS NULL`);
        out.questions = await questions(q, limit, all.filter((x) => evaluateSubjectAccess(records, x.id).allowed).map((x) => x.id));
      }
    }
    return out;
  },

  async admin(admin: AdminPrincipal, q: string, scopes: string[] | undefined, limit: number) {
    const wanted = (scopes?.length ? scopes : ['students', 'lessons']).filter((s) => ADMIN_SCOPES[s] && hasPermission(admin, ADMIN_SCOPES[s] as string));
    const out: Record<string, unknown[]> = {};
    for (const s of wanted) {
      if (s === 'lessons') out.lessons = await lessons(q, limit, true);
      else if (s === 'questions') out.questions = await questions(q, limit, null);
      else out[s] = await adminScope(s, q, limit);
    }
    return out;
  },
};
