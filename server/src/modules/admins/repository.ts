import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import type { AdminRow } from './types.js';

const SELECT_ADMIN = `
  SELECT u.id, u.name_en, u.name_ar, u.email, u.phone, u.avatar_url, u.status, u.created_at,
         au.id AS admin_user_id, au.password_hash, au.mfa_enabled, au.mfa_secret, au.mfa_pending_secret,
         au.last_login_at, au.preferences,
         r.id AS role_id, r.key AS role_key, r.name_en AS role_name_en, r.name_ar AS role_name_ar
    FROM ${T.users} u
    JOIN ${T.admin_users} au ON au.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT r2.* FROM ${T.admin_roles} ar JOIN ${T.roles} r2 ON r2.id = ar.role_id
       WHERE ar.user_id = u.id ORDER BY r2.is_system DESC LIMIT 1
    ) r ON true
   WHERE u.kind = 'admin' AND u.deleted_at IS NULL`;

export interface AdminListFilter {
  roleId?: string;
  status?: string;
  q?: string;
  sort: string;
  limit: number;
  offset: number;
}

export const adminsRepo = {
  get(id: string, ex?: Executor) {
    return db.maybeOne<AdminRow>(`${SELECT_ADMIN} AND u.id = $1`, [id], ex);
  },
  getByEmail(email: string, ex?: Executor) {
    return db.maybeOne<AdminRow>(`${SELECT_ADMIN} AND lower(u.email) = lower($1)`, [email], ex);
  },
  async list(f: AdminListFilter): Promise<{ rows: AdminRow[]; total: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.roleId) {
      params.push(f.roleId);
      where.push(`r.id = $${params.length}`);
    }
    if (f.status) {
      params.push(f.status);
      where.push(`u.status = $${params.length}`);
    }
    if (f.q) {
      params.push(`%${f.q.toLowerCase()}%`);
      where.push(`(lower(u.name_en) LIKE $${params.length} OR u.name_ar LIKE $${params.length} OR lower(u.email) LIKE $${params.length} OR coalesce(u.phone,'') LIKE $${params.length})`);
    }
    const base = `${SELECT_ADMIN}${where.length ? ` AND ${where.join(' AND ')}` : ''}`;
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM (${base}) x`, params)) ?? 0;
    params.push(f.limit, f.offset);
    const rows = await db.many<AdminRow>(`${base} ORDER BY ${f.sort} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { rows, total };
  },
  async stats() {
    return db.one<{ total: number; active: number; invited: number; mfa: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE u.status = 'active')::int AS active,
              count(*) FILTER (WHERE u.status = 'invited')::int AS invited,
              count(*) FILTER (WHERE au.mfa_enabled AND u.status = 'active')::int AS mfa
         FROM ${T.users} u JOIN ${T.admin_users} au ON au.user_id = u.id
        WHERE u.kind = 'admin' AND u.deleted_at IS NULL`,
    );
  },
  async insertAdmin(input: { nameEn: string; nameAr: string; email: string; mobile: string | null; status: 'active' | 'invited'; passwordHash: string | null; invitedBy: string | null; roleId: string }, ex: Executor): Promise<string> {
    const u = await db.one<{ id: string }>(
      `INSERT INTO ${T.users} (kind, email, phone, name_en, name_ar, status, locale) VALUES ('admin', $1, $2, $3, $4, $5, 'en') RETURNING id`,
      [input.email.toLowerCase(), input.mobile, input.nameEn, input.nameAr, input.status],
      ex,
    );
    await db.query(
      `INSERT INTO ${T.admin_users} (user_id, password_hash, invited_by, invited_at, password_changed_at)
       VALUES ($1, $2, $3, CASE WHEN $3::uuid IS NULL THEN NULL ELSE now() END, CASE WHEN $2::text IS NULL THEN NULL ELSE now() END)`,
      [u.id, input.passwordHash, input.invitedBy],
      ex,
    );
    await db.query(`INSERT INTO ${T.admin_roles} (user_id, role_id, granted_by) VALUES ($1, $2, $3)`, [u.id, input.roleId, input.invitedBy], ex);
    return u.id;
  },
  async setRole(userId: string, roleId: string, by: string, ex: Executor) {
    await db.query(`DELETE FROM ${T.admin_roles} WHERE user_id = $1`, [userId], ex);
    await db.query(`INSERT INTO ${T.admin_roles} (user_id, role_id, granted_by) VALUES ($1, $2, $3)`, [userId, roleId, by], ex);
  },
  setStatus(userId: string, status: string, reason: string | null, ex?: Executor) {
    return db.query(
      `WITH u AS (UPDATE ${T.users} SET status = $2 WHERE id = $1 RETURNING id)
       UPDATE ${T.admin_users} SET deactivated_at = CASE WHEN $2 = 'deactivated' THEN now() ELSE NULL END, deactivated_reason = $3 WHERE user_id = $1`,
      [userId, status, reason],
      ex,
    );
  },
  updateAdminUser(userId: string, patch: Record<string, unknown>, ex?: Executor) {
    const keys = Object.keys(patch);
    if (!keys.length) return Promise.resolve();
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    return db.query(`UPDATE ${T.admin_users} SET ${sets} WHERE user_id = $1`, [userId, ...keys.map((k) => patch[k])], ex);
  },
  updateUser(userId: string, patch: Record<string, unknown>, ex?: Executor) {
    const keys = Object.keys(patch);
    if (!keys.length) return Promise.resolve();
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    return db.query(`UPDATE ${T.users} SET ${sets} WHERE id = $1`, [userId, ...keys.map((k) => patch[k])], ex);
  },
  countActiveSuperAdmins(ex?: Executor) {
    return db.scalar<number>(
      `SELECT count(*)::int FROM ${T.admin_roles} ar JOIN ${T.roles} r ON r.id = ar.role_id JOIN ${T.users} u ON u.id = ar.user_id
        WHERE r.key = 'super_admin' AND u.status = 'active' AND u.deleted_at IS NULL`,
      [],
      ex,
    );
  },
  emailTaken(email: string, exceptId?: string) {
    return db.scalar<number>(`SELECT count(*)::int FROM ${T.users} WHERE lower(email) = lower($1) AND ($2::uuid IS NULL OR id <> $2::uuid)`, [email, exceptId ?? null]);
  },
  // ── inbox ──
  inbox(userId: string, opts: { unread?: boolean; limit: number; before?: { at: string; id: string } | null }) {
    const params: unknown[] = [userId];
    let where = 'user_id = $1';
    if (opts.unread) where += ' AND read_at IS NULL';
    if (opts.before) {
      params.push(opts.before.at, opts.before.id);
      where += ` AND (created_at, id) < ($2::timestamptz, $3::uuid)`;
    }
    params.push(opts.limit + 1);
    return db.many<{ id: string; title_en: string; title_ar: string; body_en: string; body_ar: string; created_at: Date; read_at: Date | null; href: string; kind: string }>(
      `SELECT id, title_en, title_ar, body_en, body_ar, created_at, read_at, href, kind FROM ${T.admin_notifications}
        WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params,
    );
  },
  unreadCount(userId: string) {
    return db.scalar<number>(`SELECT count(*)::int FROM ${T.admin_notifications} WHERE user_id = $1 AND read_at IS NULL`, [userId]).then((n) => n ?? 0);
  },
  markRead(userId: string, id: string) {
    return db.exec(`UPDATE ${T.admin_notifications} SET read_at = now() WHERE user_id = $1 AND id = $2 AND read_at IS NULL`, [userId, id]);
  },
  markAllRead(userId: string) {
    return db.exec(`UPDATE ${T.admin_notifications} SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [userId]);
  },
};
